import { Logger } from '@nestjs/common';

/** Valor padrão inseguro — proibido em produção. */
export const DEV_JWT_FALLBACK = 'dev-jwt-secret-change-me';

export const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Driver de armazenamento normalizado ("local" | "s3").
 * Centraliza a comparação para que `STORAGE_DRIVER=S3` não caia silenciosamente
 * em "local" (uploads efêmeros) em um ponto do código e não em outro.
 */
export function storageDriver(): string {
  return (process.env.STORAGE_DRIVER ?? 'local').trim().toLowerCase();
}

/**
 * Valida as variáveis de ambiente obrigatórias na inicialização.
 *
 * - Produção: falha com lista completa do que falta (ou de valores proibidos).
 * - Desenvolvimento/teste: não bloqueia; os acessadores de segredo em
 *   `common/auth.ts` aplicam fallbacks locais.
 */
export function validateEnv(): void {
  if (!isProduction()) {
    warnOptionalIntegrations();
    return;
  }

  const missing: string[] = [];
  const invalid: string[] = [];

  const required = [
    'NODE_ENV',
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CORS_ORIGIN',
    'REDIS_URL',
  ];
  for (const key of required) {
    if (!process.env[key]?.trim()) missing.push(key);
  }

  if (storageDriver() === 's3') {
    for (const key of ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
      if (!process.env[key]?.trim()) missing.push(key);
    }
  }

  // Driver de armazenamento desconhecido cairia silenciosamente em "local"
  // (uploads efêmeros). Em produção falhar cedo é melhor.
  const driver = storageDriver();
  if (driver !== 'local' && driver !== 's3') {
    invalid.push(
      `STORAGE_DRIVER inválido: "${process.env.STORAGE_DRIVER}" (use "local" ou "s3")`,
    );
  }

  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    if (process.env[key]?.trim() === DEV_JWT_FALLBACK) {
      invalid.push(`${key} não pode ser o valor padrão "${DEV_JWT_FALLBACK}"`);
    }
  }

  if (missing.length || invalid.length) {
    const lines = [
      'Configuração de ambiente inválida para produção (NODE_ENV=production):',
      ...missing.map((k) => `  - variável obrigatória ausente: ${k}`),
      ...invalid.map((k) => `  - ${k}`),
      'Corrija as variáveis acima e reinicie a API.',
    ];
    throw new Error(lines.join('\n'));
  }

  warnOptionalIntegrations();
}

/** Origens permitidas no CORS (lista separada por vírgula via CORS_ORIGIN). */
export function corsOrigins(): string[] {
  const raw =
    process.env.CORS_ORIGIN?.trim() ||
    (isProduction() ? '' : process.env.WEB_URL?.trim() || 'http://localhost:3000');
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function warnOptionalIntegrations() {
  const logger = new Logger('Env');
  if (process.env.FILE_SCAN_ENABLED !== 'false' && !process.env.CLAMAV_HOST) {
    logger.warn(
      'ClamAV não configurado (CLAMAV_HOST vazio): uploads seguem apenas com a ' +
        'verificação heurística. Configure CLAMAV_HOST/CLAMAV_PORT para ativar o antivírus.',
    );
  }
  if (!process.env.REDIS_URL) {
    logger.warn(
      'REDIS_URL não definida: notificações em tempo real ficam limitadas a uma ' +
        'única instância da API (fallback em processo).',
    );
  }
}
