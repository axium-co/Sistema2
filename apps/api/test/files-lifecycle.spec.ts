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
 * Regras de segurança do módulo de arquivos:
 *  - a chave de armazenamento é prefixada por empresa (isolamento no S3/MinIO);
 *  - arquivo na lixeira não pode ser baixado;
 *  - lixeira → restauração NÃO libera um arquivo em quarentena (a quarentena
 *    só sai com `release`, com auditoria).
 */
describe('Ciclo de vida do arquivo (lixeira e quarentena)', () => {
  const prisma = new PrismaService();
  const audit = { log: async () => undefined } as any;
  const bus = { publish: () => undefined, subscribe: () => () => undefined } as any;

  const originalUploadDir = process.env.UPLOAD_DIR;
  const originalScan = process.env.FILE_SCAN_ENABLED;
  const tempDir = mkdtempSync(join(tmpdir(), 'axium-lifecycle-'));

  let files: FilesService;
  let tenantId: string;
  let userId: string;

  const run = <T>(fn: () => Promise<T> | T) => TenantContext.run({ tenantId, userId }, fn);

  beforeAll(async () => {
    process.env.UPLOAD_DIR = tempDir;
    process.env.FILE_SCAN_ENABLED = 'false';
    await prisma.$connect();
    const suffix = Date.now();
    const tenant = await prisma.tenant.create({ data: { name: 'Lifecycle', slug: `lifecycle-${suffix}` } });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: { tenantId, email: `lifecycle-${suffix}@test.dev`, passwordHash: 'x', name: 'Tester' },
    });
    userId = user.id;
    files = new FilesService(prisma, audit, new StorageService(), new ScannerService(), bus);
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

  it('prefixa a chave de armazenamento com a empresa', async () => {
    const init = await run(() =>
      files.initChunkedUpload({ name: 'prefixo.txt', mimeType: 'text/plain', size: 10, userId }),
    );
    expect(init.storageKey.startsWith(`tenants/${tenantId}/`)).toBe(true);
    await run(() => files.abortChunked(init.uploadId));
  });

  it('bloqueia o download de arquivo na lixeira', async () => {
    const created = await run(async () =>
      prisma.db.file.create({
        data: {
          uploadedBy: userId,
          name: 'lixeira.txt',
          mimeType: 'text/plain',
          sizeBytes: BigInt(10),
          storageKey: `tenants/${tenantId}/lixeira.txt`,
          status: 'AVAILABLE',
        },
      }),
    );

    await run(() => files.trash(created.id));
    await expect(run(() => files.content(created.id))).rejects.toThrow(/lixeira/i);

    await run(() => files.restore(created.id));
    const after = await run(async () => prisma.db.file.findFirst({ where: { id: created.id } }));
    expect(after?.deletedAt).toBeNull();
  });

  it('não libera arquivo em quarentena ao restaurar', async () => {
    const created = await run(async () =>
      prisma.db.file.create({
        data: {
          uploadedBy: userId,
          name: 'perigoso.exe.txt',
          mimeType: 'text/plain',
          sizeBytes: BigInt(10),
          storageKey: `tenants/${tenantId}/perigoso.txt`,
          status: 'QUARANTINED',
          scanResult: 'detecção de ameaça',
        },
      }),
    );

    await run(() => files.trash(created.id));
    const restored = await run(() => files.restore(created.id));
    expect(restored.status).toBe('QUARANTINED');

    const after = await run(async () => prisma.db.file.findFirst({ where: { id: created.id } }));
    expect(after?.status).toBe('QUARANTINED');
    await expect(run(() => files.content(created.id))).rejects.toThrow(/indisponível/i);
  });
});
