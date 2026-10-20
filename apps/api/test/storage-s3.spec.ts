import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StorageService } from '../src/modules/files/storage.service';

/**
 * Driver S3/MiniIO: valida a seleção do driver e a geração de URL pré-assinada
 * (assinatura local, sem rede) — os containers MinIO não estão disponíveis no
 * registry deste ambiente (ver README).
 */
describe('StorageService (S3/MinIO)', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_BUCKET = 'axium-files';
    process.env.S3_ACCESS_KEY = 'axium';
    process.env.S3_SECRET_KEY = 'axium_minio_password';
    process.env.S3_FORCE_PATH_STYLE = 'true';
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('expõe o modo de upload direto e gera URL pré-assinada (path-style)', async () => {
    const service = new StorageService();
    expect(service.supportsDirectUpload).toBe(true);

    const url = await service.presignedPutUrl('tenants/t1/documents/relatorio.pdf', 'application/pdf');
    expect(url.startsWith('http://localhost:9000/axium-files/tenants/t1/documents/relatorio.pdf')).toBe(true);
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(url).toContain('X-Amz-Signature=');
  });

  it('usa driver local por padrão (sem upload direto)', async () => {
    process.env.STORAGE_DRIVER = 'local';
    const service = new StorageService();
    expect(service.supportsDirectUpload).toBe(false);
  });
});
