import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { corsOrigins, validateEnv } from '../src/config/env';
import { HealthController } from '../src/health.controller';

/**
 * Contrato de produção que o deploy depende:
 *  - GET /api/health responde { status: 'ok' } (usado pelo healthcheck do Railway/Render);
 *  - CORS reflete apenas as origens de CORS_ORIGIN;
 *  - a API aborta o boot em produção se faltar variável obrigatória ou se o
 *    STORAGE_DRIVER for desconhecido (evita upload efêmero silencioso).
 *
 * O bootstrap HTTP real (NestFactory + CORS live) é validado em `npm run smoke`
 * e no build de imagem — aqui garantimos o contrato sem depender dos metadados
 * de decorator, que o esbuild do vitest não emite para injeção de dependência.
 */
describe('contrato de deploy (health + CORS)', () => {
  const original = { ...process.env };

  afterAll(() => {
    process.env = { ...original };
  });

  it('health responde status ok sem tocar em banco/redis', () => {
    const body = new HealthController().health();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('axium-api');
    expect(typeof body.time).toBe('string');
  });

  it('corsOrigins() lê a lista de CORS_ORIGIN separada por vírgula', () => {
    process.env.CORS_ORIGIN = 'https://axium.vercel.app, https://admin.axium.app ';
    expect(corsOrigins()).toEqual(['https://axium.vercel.app', 'https://admin.axium.app']);
  });

  it('corsOrigins() remove valores vazios', () => {
    process.env.CORS_ORIGIN = 'https://axium.vercel.app,,  ,';
    expect(corsOrigins()).toEqual(['https://axium.vercel.app']);
  });
});

describe('validação de ambiente em produção', () => {
  const original = { ...process.env };
  const valid = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://axium:senha@localhost:5432/axium?schema=public',
    JWT_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    CORS_ORIGIN: 'https://axium.vercel.app',
    REDIS_URL: 'redis://localhost:6379',
    STORAGE_DRIVER: 'local',
  };

  afterEach(() => {
    process.env = { ...original };
  });

  it('aceita configuração completa', () => {
    process.env = { ...valid };
    expect(() => validateEnv()).not.toThrow();
  });

  it('falha quando falta variável obrigatória', () => {
    process.env = { ...valid, REDIS_URL: '' };
    expect(() => validateEnv()).toThrow(/REDIS_URL/);
  });

  it('falha quando JWT_SECRET é o valor de desenvolvimento', () => {
    process.env = { ...valid, JWT_SECRET: 'dev-jwt-secret-change-me' };
    expect(() => validateEnv()).toThrow(/JWT_SECRET/);
  });

  it('falha quando STORAGE_DRIVER é desconhecido', () => {
    process.env = { ...valid, STORAGE_DRIVER: 'azure-blob' };
    expect(() => validateEnv()).toThrow(/STORAGE_DRIVER/);
  });

  it('aceita STORAGE_DRIVER em maiúsculas (normalizado)', () => {
    process.env = { ...valid, STORAGE_DRIVER: 'S3', S3_ENDPOINT: 'http://localhost:9000', S3_REGION: 'us-east-1', S3_BUCKET: 'b', S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's' };
    expect(() => validateEnv()).not.toThrow();
  });

  it('exige as credenciais S3 quando o driver é s3', () => {
    process.env = { ...valid, STORAGE_DRIVER: 's3', S3_ACCESS_KEY: '', S3_SECRET_KEY: '' };
    expect(() => validateEnv()).toThrow(/S3_ACCESS_KEY/);
  });

  it('não bloqueia o boot em desenvolvimento', () => {
    process.env = { ...original, NODE_ENV: 'development' };
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).not.toThrow();
  });
});
