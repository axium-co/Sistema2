/**
 * Smoke test HTTP real (sem vitest/esbuild) — sobe a API compilada e valida:
 *   - GET /api/health => 200 { status: 'ok' }
 *   - CORS libera CORS_ORIGIN e bloqueia origem desconhecida
 *
 * Requer o build (`npm run build`) e variáveis de ambiente mínimas
 * (DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, CORS_ORIGIN).
 *
 * Uso: npm run smoke -w @axium/api
 */
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { corsOrigins } from '../src/config/env';

async function main() {
  const app: INestApplication = await NestFactory.create(AppModule, { cors: false, logger: false });
  app.setGlobalPrefix('api');
  const origins = corsOrigins();
  app.enableCors({ origin: origins, credentials: true });
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api`;
  const failures: string[] = [];

  const health = await fetch(`${base}/health`);
  const healthBody = (await health.json()) as { status?: string };
  if (health.status !== 200 || healthBody.status !== 'ok') {
    failures.push(`health: esperado 200/ok, recebido ${health.status}/${healthBody.status}`);
  }

  if (origins.length) {
    const allowed = await fetch(`${base}/health`, {
      method: 'OPTIONS',
      headers: { Origin: origins[0], 'Access-Control-Request-Method': 'GET' },
    });
    if (allowed.headers.get('access-control-allow-origin') !== origins[0]) {
      failures.push(`CORS não liberou a origem configurada (${origins[0]})`);
    }
  }

  const blocked = await fetch(`${base}/health`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://origem-nao-permitida.example', 'Access-Control-Request-Method': 'GET' },
  });
  if (blocked.headers.get('access-control-allow-origin')) {
    failures.push('CORS liberou origem desconhecida');
  }

  await app.close();

  if (failures.length) {
    console.error('SMOKE FALHOU:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
  console.log('SMOKE OK: /api/health=200 e CORS respeitando CORS_ORIGIN');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
