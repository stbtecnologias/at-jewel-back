import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  // Desabilita os body parsers padrao para podermos aplicar limites de tamanho
  // explicitos abaixo (mitigacao de DoS por payload grande).
  // bufferLogs=true segura logs de startup ate que o LoggerModule estar pronto.
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });

  // Substitui o logger default do Nest pelo Pino. Tudo (NestJS internals
  // + nosso codigo) passa a logar via Pino — JSON em prod, pretty em dev.
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  // Security headers padrao (X-Frame-Options, X-Content-Type-Options,
  // Strict-Transport-Security, etc.) como defesa em profundidade.
  app.use(helmet());

  // Limite de body em 100kb global. Endpoints que recebem upload
  // (ex.: imagens de catalogo na S9) devem sobrescrever localmente.
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));

  // CORS com allowlist explicita por env. Lista separada por virgula sem espacos.
  // Default em dev: localhost:3000 (este backend) e localhost:5173 (vite default).
  // Producao precisa setar CORS_ORIGINS com o dominio do dashboard.
  const corsOrigins = (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'X-Safira-Key'],
    maxAge: 3600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = config.get<string>('PORT') ?? 3000;
  await app.listen(port);
  app.get(Logger).log(`A.T. JEWEL API rodando na porta ${port}`, 'Bootstrap');
}

bootstrap();
