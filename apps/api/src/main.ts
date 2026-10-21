import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv, corsOrigins } from './config/env';

// Tamanhos de arquivo usam BigInt; serializa como número no JSON.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule, { cors: false });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86400,
  });
  // CORP cross-origin: o front da Vercel carrega arquivos (/api/files/...) deste domínio.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useGlobalPipes(
    new ValidationPipe({
      // Whitelist: campos não declarados nos DTOs são descartados.
      whitelist: true,
      // forbidNonWhitelisted desligado por padrão (payloads legados do front
      // não quebram); ative com VALIDATION_STRICT=true para rejeitar campos extras.
      forbidNonWhitelisted: process.env.VALIDATION_STRICT === 'true',
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3333);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(
    `AXIUM API rodando em http://localhost:${port}/api (CORS: ${corsOrigins().join(', ') || 'sem origens'})`,
  );
}

bootstrap();
