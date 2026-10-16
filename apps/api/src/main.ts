import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

// Tamanhos de arquivo usam BigInt; serializa como número no JSON.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: [process.env.WEB_URL ?? 'http://localhost:3000'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  const port = Number(process.env.PORT ?? 3333);
  await app.listen(port);
  new Logger('Bootstrap').log(`AXIUM API rodando em http://localhost:${port}/api`);
}

bootstrap();
