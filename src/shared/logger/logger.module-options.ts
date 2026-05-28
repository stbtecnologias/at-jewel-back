import { randomUUID } from 'crypto';
import type { Params } from 'nestjs-pino';

/**
 * Configuracao do Pino para a at-jewel-api.
 *
 * Decisoes:
 * - Em dev: pino-pretty com cores, single-line e timestamp curto
 * - Em prod: JSON puro, level info
 * - Request ID: UUID v4 por requisicao (header X-Request-Id sobrescreve se vier)
 * - Redacao agressiva: PII (telefone, email, CPF) e secrets (api keys, tokens)
 *   nunca aparecem nos logs. `*` na frente cobre qualquer nivel de aninhamento.
 * - Auto-logging das requisicoes HTTP (status, latencia)
 */
export function buildLoggerOptions(): Params {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    pinoHttp: {
      level: isProd ? 'info' : 'debug',
      transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname,req,res,responseTime',
            },
          },
      // Redact mata o valor antes de virar log. Lista cobre:
      //  - Secrets em headers
      //  - Tokens e password hashes (campos comuns no payload)
      //  - PII (telefone, email, CPF, observacoes livres)
      redact: {
        paths: [
          'req.headers["x-api-key"]',
          'req.headers["x-safira-key"]',
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          '*.password',
          '*.passwordHash',
          '*.password_hash',
          '*.refreshToken',
          '*.refresh_token',
          '*.refreshTokenHash',
          '*.refresh_token_hash',
          '*.accessToken',
          '*.access_token',
          '*.rawKey',
          '*.keyHash',
          '*.key_hash',
          '*.telefone1',
          '*.telefone_1',
          '*.telefone2',
          '*.telefone_2',
          '*.whatsapp',
          '*.whatsappInterno',
          '*.whatsapp_interno',
          '*.email',
          '*.cpf',
          '*.rg',
          '*.observacaoGeral',
          '*.observacao_geral',
          '*.observacaoCredito',
          '*.observacao_credito',
          '*.intencaoCompra',
          '*.intencao_compra',
          '*.notasInternas',
          '*.notas_internas',
          '*.resumoTriagem',
          '*.resumo_triagem',
          '*.wishlist',
        ],
        censor: '[REDACTED]',
      },
      genReqId: (req) => {
        const incoming = (req.headers['x-request-id'] as string) ?? null;
        return incoming ?? randomUUID();
      },
      customProps: () => ({ app: 'at-jewel-api' }),
      serializers: {
        req: (req: { id: unknown; method: unknown; url: unknown }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: unknown }) => ({ statusCode: res.statusCode }),
      },
    },
  };
}
