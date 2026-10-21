import { Injectable } from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync, promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import { storageDriver } from '../../config/env';

@Injectable()
export class StorageService {
  private readonly driver = storageDriver();
  private readonly uploadDir = resolve(process.env.UPLOAD_DIR ?? './uploads');
  private s3?: S3Client;

  constructor() {
    if (this.driver === 'local' && !existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  private getS3(): S3Client {
    if (!this.s3) {
      this.s3 = new S3Client({
        region: process.env.S3_REGION ?? 'us-east-1',
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY ?? '',
          secretAccessKey: process.env.S3_SECRET_KEY ?? '',
        },
      });
    }
    return this.s3;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.driver === 's3') {
      await this.getS3().send(
        new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
      );
      return;
    }
    const target = join(this.uploadDir, key);
    mkdirSync(join(target, '..'), { recursive: true });
    await fs.writeFile(target, body);
  }

  async getStream(key: string): Promise<Readable> {
    if (this.driver === 's3') {
      const result = await this.getS3().send(
        new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      );
      return result.Body as Readable;
    }
    return createReadStream(join(this.uploadDir, key));
  }

  async getBuffer(key: string): Promise<Buffer> {
    const stream = await this.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  get supportsDirectUpload(): boolean {
    return this.driver === 's3';
  }

  private get chunkRoot() {
    return join(this.uploadDir, '.chunks');
  }

  /**
   * Partes do upload resumível. Com driver `s3`, as partes vão para o próprio
   * bucket (prefixo `.chunks/`) para não depender de disco local — servidores
   * como Railway/Render têm disco efêmero. Com driver `local`, usam `UPLOAD_DIR`.
   */
  async writeChunk(uploadId: string, index: number, data: Buffer): Promise<void> {
    if (this.driver === 's3') {
      await this.getS3().send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: `${this.chunkS3Prefix(uploadId)}/${index}.part`,
          Body: data,
        }),
      );
      return;
    }
    const dir = join(this.chunkRoot, uploadId);
    mkdirSync(dir, { recursive: true });
    await fs.writeFile(join(dir, `${index}.part`), data);
  }

  async assembleChunks(uploadId: string, count: number): Promise<Buffer> {
    const parts: Buffer[] = [];
    for (let index = 0; index < count; index++) {
      if (this.driver === 's3') {
        const result = await this.getS3().send(
          new GetObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: `${this.chunkS3Prefix(uploadId)}/${index}.part`,
          }),
        );
        parts.push(Buffer.from(await result.Body!.transformToByteArray()));
        continue;
      }
      const part = join(this.chunkRoot, uploadId, `${index}.part`);
      if (!existsSync(part)) throw new Error(`Parte ${index} do upload não encontrada`);
      parts.push(await fs.readFile(part));
    }
    return Buffer.concat(parts);
  }

  async removeChunks(uploadId: string): Promise<void> {
    if (this.driver === 's3') {
      const prefix = `${this.chunkS3Prefix(uploadId)}/`;
      let token: string | undefined;
      do {
        const listed = await this.getS3().send(
          new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: prefix, ContinuationToken: token }),
        );
        const keys = (listed.Contents ?? []).map((o) => o.Key!).filter(Boolean);
        if (keys.length) {
          await this.getS3().send(
            new DeleteObjectsCommand({
              Bucket: process.env.S3_BUCKET,
              Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
            }),
          );
        }
        token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (token);
      return;
    }
    await fs.rm(join(this.chunkRoot, uploadId), { recursive: true, force: true });
  }

  private chunkS3Prefix(uploadId: string) {
    return `.chunks/${uploadId}`;
  }

  async delete(key: string): Promise<void> {
    if (this.driver === 's3') {
      await this
        .getS3()
        .send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
      return;
    }
    await fs.rm(join(this.uploadDir, key), { force: true });
  }

  async presignedPutUrl(key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.getS3(),
      new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 900 },
    );
  }
}
