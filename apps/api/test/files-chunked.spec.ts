import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/common/tenant-context';
import { StorageService } from '../src/modules/files/storage.service';
import { ScannerService } from '../src/modules/files/scanner.service';
import { FilesService } from '../src/modules/files/files.service';

/**
 * Upload resumível por partes: init → chunks → complete, com validação de
 * tamanho/índice e abortamento. O scan fica desabilitado no teste.
 */
describe('Upload chunked de arquivos', () => {
  const prisma = new PrismaService();
  const audit = { log: async () => undefined } as any;
  const bus = { publish: () => undefined, subscribe: () => () => undefined } as any;

  const originalUploadDir = process.env.UPLOAD_DIR;
  const originalScan = process.env.FILE_SCAN_ENABLED;
  const tempDir = mkdtempSync(join(tmpdir(), 'axium-uploads-'));

  let files: FilesService;
  let storage: StorageService;
  let tenantId: string;
  let userId: string;

  const run = <T>(fn: () => Promise<T> | T) => TenantContext.run({ tenantId, userId }, fn);

  const MB = 1024 * 1024;

  beforeAll(async () => {
    process.env.UPLOAD_DIR = tempDir;
    process.env.FILE_SCAN_ENABLED = 'false';
    process.env.UPLOAD_CHUNK_SIZE_MB = '1';
    await prisma.$connect();
    const suffix = Date.now();
    const tenant = await prisma.tenant.create({ data: { name: 'Upload', slug: `upload-${suffix}` } });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: { tenantId, email: `upload-${suffix}@test.dev`, passwordHash: 'x', name: 'Tester' },
    });
    userId = user.id;

    storage = new StorageService();
    files = new FilesService(prisma, audit, storage, new ScannerService(), bus);
  });

  afterAll(async () => {
    await TenantContext.run({ allowUnscoped: true }, async () => {
      await prisma.file.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
    process.env.UPLOAD_DIR = originalUploadDir;
    process.env.FILE_SCAN_ENABLED = originalScan;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('envia em partes, monta o arquivo final e libera (scan desabilitado)', async () => {
    const content = Buffer.alloc(Math.round(1.5 * MB), 'a');
    const init = await run(() =>
      files.initChunkedUpload({ name: 'relatorio.pdf', mimeType: 'application/pdf', size: content.length, userId }),
    );
    expect(init.totalChunks).toBe(2);
    expect(init.chunkSize).toBe(MB);

    await run(() => files.uploadChunk(init.uploadId, 0, content.subarray(0, MB)));
    await run(() => files.uploadChunk(init.uploadId, 1, content.subarray(MB)));

    const done = await run(() => files.completeChunked(init.uploadId));
    expect(done.status).toBe('AVAILABLE');
    expect(done.sizeBytes).toBe(content.length);
    expect(done.checksum).toMatch(/^[0-9a-f]{64}$/);

    const stored = await storage.getBuffer(done.storageKey);
    expect(stored.equals(content)).toBe(true);

    const master = await run(async () => prisma.db.file.findFirst({ where: { id: done.id }, include: { versions: true } }));
    expect(master?.versions).toHaveLength(1);
  });

  it('rejeita complete com partes faltando', async () => {
    const init = await run(() =>
      files.initChunkedUpload({ name: 'parcial.pdf', mimeType: 'application/pdf', size: Math.round(1.2 * MB), userId }),
    );
    await run(() => files.uploadChunk(init.uploadId, 0, Buffer.alloc(MB, 'b')));
    await expect(run(() => files.completeChunked(init.uploadId))).rejects.toThrow('incompleto');
  });

  it('valida tipo de arquivo, índice e tamanho da parte', async () => {
    await expect(
      run(() => files.initChunkedUpload({ name: 'x.exe', mimeType: 'application/x-msdownload', size: 10, userId })),
    ).rejects.toThrow('não permitido');

    const init = await run(() =>
      files.initChunkedUpload({ name: 'ok.txt', mimeType: 'text/plain', size: Math.round(1.1 * MB), userId }),
    );
    await expect(run(() => files.uploadChunk(init.uploadId, 5, Buffer.alloc(10, 'c')))).rejects.toThrow('inválido');
    await expect(run(() => files.uploadChunk(init.uploadId, 0, Buffer.alloc(0)))).rejects.toThrow('vazia');

    const big = Buffer.alloc(MB + 1, 'd');
    await expect(run(() => files.uploadChunk(init.uploadId, 0, big))).rejects.toThrow('excede');
  });

  it('aborta o upload removendo partes e registro', async () => {
    const init = await run(() =>
      files.initChunkedUpload({ name: 'abortar.txt', mimeType: 'text/plain', size: Math.round(1.5 * MB), userId }),
    );
    await run(() => files.uploadChunk(init.uploadId, 0, Buffer.alloc(MB, 'e')));

    await run(() => files.abortChunked(init.uploadId));
    const master = await run(async () => prisma.db.file.findFirst({ where: { id: init.uploadId } }));
    expect(master).toBeNull();
    await expect(run(() => files.uploadChunk(init.uploadId, 0, Buffer.alloc(10, 'f')))).rejects.toThrow('não encontrado');
  });
});
