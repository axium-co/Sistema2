import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { EventBusService } from '../../common/event-bus.service';
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
  private readonly logger = new Logger('FilesService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly scanner: ScannerService,
    private readonly bus: EventBusService,
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

    const scanEnabled = process.env.FILE_SCAN_ENABLED !== 'false';
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    const created = await this.prisma.db.file.create({
      data: {
        folderId: params.folderId ?? null,
        uploadedBy: userId,
        name,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        storageKey,
        status: scanEnabled ? 'SCANNING' : 'AVAILABLE',
        checksum,
        ...(scanEnabled ? {} : { scanResult: 'verificação desabilitada', scannedAt: new Date() }),
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

    if (scanEnabled) {
      this.scheduleScan({
        fileId: created.id,
        storageKey,
        name,
        mimeType: file.mimetype,
        uploaderId: userId,
        buffer: file.buffer,
      });
    }
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
      chunkedUpload: true,
      chunkSizeMb: this.chunkSizeBytes / (1024 * 1024),
      scanEnabled: process.env.FILE_SCAN_ENABLED !== 'false',
      maxSizeMb: MAX_FILE_SIZE_MB,
    };
  }

  private get chunkSizeBytes() {
    const mb = Number(process.env.UPLOAD_CHUNK_SIZE_MB ?? 5);
    return Math.max(1, Number.isFinite(mb) ? mb : 5) * 1024 * 1024;
  }

  /**
   * Inicia um upload resumível: cria o registro UPLOADING e informa o tamanho
   * das partes. As partes são gravadas em disco e montadas no `complete`.
   */
  async initChunkedUpload(params: {
    name: string;
    mimeType: string;
    size: number;
    userId: string;
    folderId?: string;
    entityType?: string;
    entityId?: string;
  }) {
    if (!params.name) throw new BadRequestException('Nome do arquivo é obrigatório');
    if (!Number.isFinite(params.size) || params.size <= 0) {
      throw new BadRequestException('Tamanho do arquivo inválido');
    }
    if (params.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new BadRequestException(`Arquivo excede o limite de ${MAX_FILE_SIZE_MB} MB`);
    }
    if (!ALLOWED_MIME.has(params.mimeType)) {
      throw new BadRequestException(`Tipo de arquivo não permitido: ${params.mimeType}`);
    }

    const name = sanitizeName(params.name);
    const storageKey = `${randomUUID()}/${name}`;
    const chunkSize = this.chunkSizeBytes;
    const totalChunks = Math.max(1, Math.ceil(params.size / chunkSize));

    const file = await this.prisma.db.file.create({
      data: {
        folderId: params.folderId ?? null,
        uploadedBy: params.userId,
        name,
        mimeType: params.mimeType,
        sizeBytes: BigInt(params.size),
        storageKey,
        status: 'UPLOADING',
      },
    });

    if (params.entityType && params.entityId) {
      await this.prisma.db.fileLink.create({
        data: { fileId: file.id, entityType: params.entityType, entityId: params.entityId },
      });
    }

    return { ...this.serialize(file), uploadId: file.id, chunkSize, totalChunks };
  }

  async uploadChunk(id: string, index: number, chunk: Buffer | undefined) {
    const file = await this.prisma.findByIdOrFail('file', id);
    if (file.status !== 'UPLOADING') {
      throw new BadRequestException('Este arquivo não está aguardando upload');
    }
    if (!chunk || chunk.length === 0) throw new BadRequestException('Parte do arquivo vazia');
    if (chunk.length > this.chunkSizeBytes) {
      throw new BadRequestException(`Parte excede o tamanho de ${this.chunkSizeBytes / (1024 * 1024)} MB`);
    }
    const totalChunks = Math.max(1, Math.ceil(Number(file.sizeBytes) / this.chunkSizeBytes));
    if (!Number.isInteger(index) || index < 0 || index >= totalChunks) {
      throw new BadRequestException(`Índice de parte inválido (esperado 0..${totalChunks - 1})`);
    }
    await this.storage.writeChunk(file.id, index, chunk);
    return { uploadId: file.id, index, totalChunks };
  }

  /** Monta as partes, valida o tamanho e segue o fluxo normal de verificação. */
  async completeChunked(id: string) {
    const file = await this.prisma.findByIdOrFail('file', id);
    if (file.status !== 'UPLOADING') {
      throw new BadRequestException('Este arquivo não está aguardando upload');
    }
    const totalChunks = Math.max(1, Math.ceil(Number(file.sizeBytes) / this.chunkSizeBytes));
    let buffer: Buffer;
    try {
      buffer = await this.storage.assembleChunks(file.id, totalChunks);
    } catch (err) {
      throw new BadRequestException(`Upload incompleto: ${err}`);
    }
    if (buffer.length !== Number(file.sizeBytes)) {
      throw new BadRequestException(
        `Tamanho recebido (${buffer.length} bytes) difere do informado (${file.sizeBytes} bytes)`,
      );
    }
    await this.storage.put(file.storageKey, buffer, file.mimeType);
    await this.storage.removeChunks(file.id);
    return this.finalizeUpload(file, buffer);
  }

  async abortChunked(id: string) {
    const file = await this.prisma.findByIdOrFail('file', id);
    if (file.status !== 'UPLOADING') {
      throw new BadRequestException('Este arquivo não está aguardando upload');
    }
    await this.storage.removeChunks(file.id);
    await this.prisma.db.file.delete({ where: { id } });
    return { ok: true };
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
    await this.prisma.db.file.update({ where: { id }, data: { status: 'SCANNING' } });
    this.scheduleScan({
      fileId: file.id,
      storageKey: file.storageKey,
      name: file.name,
      mimeType: file.mimeType,
      uploaderId: file.uploadedBy,
    });
    return { status: 'SCANNING' as const };
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
    return this.finalizeUpload(file, buffer);
  }

  private async finalizeUpload(file: any, buffer: Buffer) {
    const scanEnabled = process.env.FILE_SCAN_ENABLED !== 'false';
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const updated = await this.prisma.db.file.update({
      where: { id: file.id },
      data: {
        sizeBytes: BigInt(buffer.length),
        checksum,
        status: scanEnabled ? 'SCANNING' : 'AVAILABLE',
        ...(scanEnabled ? {} : { scanResult: 'verificação desabilitada', scannedAt: new Date() }),
        versions: {
          create: { version: 1, storageKey: file.storageKey, sizeBytes: BigInt(buffer.length), uploadedBy: file.uploadedBy },
        },
      },
    });
    await this.audit.log({ entityType: 'File', entityId: file.id, action: 'UPLOAD', after: { name: file.name, status: updated.status } });

    if (scanEnabled) {
      this.scheduleScan({
        fileId: file.id,
        storageKey: file.storageKey,
        name: file.name,
        mimeType: file.mimeType,
        uploaderId: file.uploadedBy,
        buffer,
      });
    }
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

  /**
   * Verificação assíncrona: o arquivo fica SCANNING até o veredito, quando o
   * status vira AVAILABLE ou QUARANTINED e um evento SSE é publicado para o
   * dono atualizar a interface em tempo real.
   */
  private scheduleScan(params: {
    fileId: string;
    storageKey: string;
    name: string;
    mimeType: string;
    uploaderId: string;
    buffer?: Buffer;
  }) {
    const { fileId, storageKey, name, mimeType, uploaderId } = params;
    setImmediate(async () => {
      try {
        const buffer = params.buffer ?? (await this.storage.getBuffer(storageKey));
        const verdict = await this.scanner.scan(buffer, name, mimeType);
        const status = verdict.clean ? 'AVAILABLE' : 'QUARANTINED';
        const scanResult = verdict.clean ? 'clean' : verdict.reason ?? 'suspeito';
        await this.prisma.file.update({
          where: { id: fileId },
          data: { status, scanResult, scannedAt: new Date() },
        });
        this.bus.publish(EventBusService.channelForUser(uploaderId), {
          type: 'file.scan',
          fileId,
          status,
          scanResult,
          fileName: name,
        });
      } catch (err) {
        this.logger.error(`Falha na verificação do arquivo ${fileId}: ${err}`);
        await this.prisma.file
          .update({
            where: { id: fileId },
            data: { status: 'QUARANTINED', scanResult: 'erro na verificação', scannedAt: new Date() },
          })
          .catch(() => undefined);
        this.bus.publish(EventBusService.channelForUser(uploaderId), {
          type: 'file.scan',
          fileId,
          status: 'QUARANTINED',
          fileName: name,
        });
      }
    });
  }

  private serialize(file: any) {
    return { ...file, sizeBytes: Number(file.sizeBytes) };
  }
}
