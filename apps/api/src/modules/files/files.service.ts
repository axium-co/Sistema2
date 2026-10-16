import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { StorageService } from './storage.service';
import { ScannerService } from './scanner.service';
import { paginate } from '../../common/pagination';
import { MAX_FILE_SIZE_MB } from '@axium/shared';

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4',
  'audio/mpeg',
]);

function sanitizeName(name: string) {
  return basename(name).replace(/[^\w.\-() ]+/g, '_').slice(0, 180) || 'arquivo';
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly scanner: ScannerService,
  ) {}

  async list(query: { search?: string; folderId?: string; trashed?: string; page?: number; pageSize?: number }) {
    const { skip, take, page, pageSize } = paginate(query);
    const where: any = query.trashed === 'true' ? { deletedAt: { not: null } } : { deletedAt: null };
    if (query.folderId) where.folderId = query.folderId;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.db.file.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { uploader: { select: { id: true, name: true } }, folder: { select: { id: true, name: true } } },
      }),
      this.prisma.db.file.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async byEntity(entityType: string, entityId: string) {
    const links = await this.prisma.db.fileLink.findMany({ where: { entityType, entityId } });
    const ids = links.map((l: any) => l.fileId);
    if (!ids.length) return [];
    return this.prisma.db.file.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: { uploader: { select: { id: true, name: true } } },
    });
  }

  async upload(params: {
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
    userId: string;
    folderId?: string;
    entityType?: string;
    entityId?: string;
  }) {
    const { file, userId } = params;
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new BadRequestException(`Arquivo excede o limite de ${MAX_FILE_SIZE_MB} MB`);
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`Tipo de arquivo não permitido: ${file.mimetype}`);
    }

    const name = sanitizeName(file.originalname);
    const storageKey = `${randomUUID()}/${name}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);

    const verdict = await this.scanner.scan(file.buffer, name, file.mimetype);
    const status = verdict.clean ? 'AVAILABLE' : 'QUARANTINED';
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    const created = await this.prisma.db.file.create({
      data: {
        folderId: params.folderId ?? null,
        uploadedBy: userId,
        name,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        storageKey,
        status,
        checksum,
        scanResult: verdict.clean ? 'clean' : verdict.reason ?? 'suspeito',
        scannedAt: new Date(),
        versions: {
          create: { version: 1, storageKey, sizeBytes: BigInt(file.size), uploadedBy: userId },
        },
      },
    });

    if (params.entityType && params.entityId) {
      await this.prisma.db.fileLink.create({
        data: { fileId: created.id, entityType: params.entityType, entityId: params.entityId },
      });
    }

    await this.audit.log({ entityType: 'File', entityId: created.id, action: 'UPLOAD', after: { name } });
    return this.serialize(created);
  }

  async get(id: string) {
    const file = await this.prisma.findByIdOrFail('file', id, {
      include: { uploader: { select: { id: true, name: true } }, links: true, versions: true },
    });
    return file;
  }

  async content(id: string) {
    const file = await this.prisma.findByIdOrFail('file', id);
    if (file.status !== 'AVAILABLE') {
      throw new ForbiddenException('Arquivo indisponível: aguardando verificação de segurança');
    }
    const stream = await this.storage.getStream(file.storageKey);
    return { file, stream };
  }

  capabilities() {
    return {
      driver: this.storage.supportsDirectUpload ? 's3' : 'local',
      directUpload: this.storage.supportsDirectUpload,
      scanEnabled: process.env.FILE_SCAN_ENABLED !== 'false',
      maxSizeMb: MAX_FILE_SIZE_MB,
    };
  }

  async listQuarantined() {
    return this.prisma.db.file.findMany({
      where: { status: 'QUARANTINED', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { uploader: { select: { id: true, name: true } } },
    });
  }

  async release(id: string) {
    await this.prisma.findByIdOrFail('file', id);
    await this.prisma.db.file.update({
      where: { id },
      data: { status: 'AVAILABLE', scanResult: 'liberado manualmente', scannedAt: new Date() },
    });
    await this.audit.log({ entityType: 'File', entityId: id, action: 'RELEASE_QUARANTINE' });
    return { ok: true };
  }

  async rescan(id: string) {
    const file = await this.prisma.findByIdOrFail('file', id);
    const buffer = await this.storage.getBuffer(file.storageKey);
    const verdict = await this.scanner.scan(buffer, file.name, file.mimeType);
    const status = verdict.clean ? 'AVAILABLE' : 'QUARANTINED';
    await this.prisma.db.file.update({
      where: { id },
      data: { status, scanResult: verdict.clean ? 'clean' : verdict.reason ?? 'suspeito', scannedAt: new Date() },
    });
    return { status, scanResult: verdict.reason ?? 'clean' };
  }

  /** Cria um registro e devolve uma URL de upload direto (S3/MinIO). */
  async presign(params: { name: string; mimeType: string; folderId?: string; userId: string }) {
    if (!this.storage.supportsDirectUpload) {
      throw new BadRequestException('Upload direto não está disponível neste ambiente');
    }
    if (!ALLOWED_MIME.has(params.mimeType)) {
      throw new BadRequestException(`Tipo de arquivo não permitido: ${params.mimeType}`);
    }
    const name = sanitizeName(params.name);
    const storageKey = `${randomUUID()}/${name}`;
    const file = await this.prisma.db.file.create({
      data: {
        folderId: params.folderId ?? null,
        uploadedBy: params.userId,
        name,
        mimeType: params.mimeType,
        sizeBytes: BigInt(0),
        storageKey,
        status: 'UPLOADING',
      },
    });
    const uploadUrl = await this.storage.presignedPutUrl(storageKey, params.mimeType);
    return { ...this.serialize(file), uploadUrl, method: 'PUT', headers: { 'Content-Type': params.mimeType } };
  }

  /** Finaliza um upload direto: baixa o objeto, verifica e atualiza o status. */
  async complete(id: string) {
    const file = await this.prisma.findByIdOrFail('file', id);
    if (file.status !== 'UPLOADING') {
      throw new BadRequestException('Este arquivo não está aguardando upload');
    }
    const buffer = await this.storage.getBuffer(file.storageKey);
    if (buffer.length > MAX_FILE_SIZE_MB * 1024 * 1024) {
      await this.storage.delete(file.storageKey);
      await this.prisma.db.file.delete({ where: { id } });
      throw new BadRequestException(`Arquivo excede o limite de ${MAX_FILE_SIZE_MB} MB`);
    }
    const verdict = await this.scanner.scan(buffer, file.name, file.mimeType);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const updated = await this.prisma.db.file.update({
      where: { id },
      data: {
        sizeBytes: BigInt(buffer.length),
        checksum,
        status: verdict.clean ? 'AVAILABLE' : 'QUARANTINED',
        scanResult: verdict.clean ? 'clean' : verdict.reason ?? 'suspeito',
        scannedAt: new Date(),
        versions: {
          create: { version: 1, storageKey: file.storageKey, sizeBytes: BigInt(buffer.length), uploadedBy: file.uploadedBy },
        },
      },
    });
    await this.audit.log({ entityType: 'File', entityId: id, action: 'UPLOAD', after: { name: file.name, status: updated.status } });
    return this.serialize(updated);
  }

  async link(id: string, entityType: string, entityId: string) {
    await this.prisma.findByIdOrFail('file', id);
    await this.prisma.db.fileLink.upsert({
      where: { fileId_entityType_entityId: { fileId: id, entityType, entityId } },
      create: { fileId: id, entityType, entityId },
      update: {},
    });
    return { ok: true };
  }

  async unlink(linkId: string) {
    await this.prisma.db.fileLink.delete({ where: { id: linkId } });
    return { ok: true };
  }

  async trash(id: string) {
    await this.prisma.findByIdOrFail('file', id);
    await this.prisma.db.file.update({ where: { id }, data: { deletedAt: new Date(), status: 'DELETED' } });
    await this.audit.log({ entityType: 'File', entityId: id, action: 'TRASH' });
    return { ok: true };
  }

  async restore(id: string) {
    await this.prisma.findByIdOrFail('file', id);
    await this.prisma.db.file.update({ where: { id }, data: { deletedAt: null, status: 'AVAILABLE' } });
    return { ok: true };
  }

  async purge(id: string) {
    const file = await this.prisma.findByIdOrFail('file', id);
    await this.storage.delete(file.storageKey);
    await this.prisma.db.file.delete({ where: { id } });
    await this.audit.log({ entityType: 'File', entityId: id, action: 'PURGE' });
    return { ok: true };
  }

  async createFolder(name: string, parentId: string | undefined, userId: string) {
    return this.prisma.db.folder.create({
      data: { name: sanitizeName(name), parentId: parentId ?? null, createdById: userId },
    });
  }

  listFolders() {
    return this.prisma.db.folder.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { files: true } } },
    });
  }

  async deleteFolder(id: string) {
    await this.prisma.findByIdOrFail('folder', id);
    await this.prisma.db.folder.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  private serialize(file: any) {
    return { ...file, sizeBytes: Number(file.sizeBytes) };
  }
}
