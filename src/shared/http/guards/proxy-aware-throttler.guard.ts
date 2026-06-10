import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard ciente de proxy.
 *
 * A API roda atras de uma cadeia de proxies (Cloudflare -> tunel cloudflared
 * -> front Next.js que reescreve /api -> API). Sem isto, `req.ip` seria sempre
 * o IP do container do front, fazendo TODOS os limites de rate (inclusive o
 * login: 5/15min) valerem globalmente para todos os usuarios — um usuario
 * errando a senha trancaria todo mundo.
 *
 * Resolve o IP real do cliente preferindo, nesta ordem:
 *   1. `cf-connecting-ip` (setado pela Cloudflare; o mais confiavel atras dela)
 *   2. primeiro IP de `x-forwarded-for`
 *   3. `req.ip` / socket (fallback p/ acesso direto sem proxy)
 *
 * Nota de seguranca: como a origem tambem e alcancavel direto pela VPN
 * (sem passar pela Cloudflare), esses headers sao spoofaveis por quem tem
 * acesso a rede interna. Aceitavel em homolog; endurecer em producao
 * (validar que a conexao veio da Cloudflare).
 */
@Injectable()
export class ProxyAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const cf = req.headers?.['cf-connecting-ip'];
    const xff = req.headers?.['x-forwarded-for'];

    return (
      (typeof cf === 'string' && cf.trim()) ||
      (typeof xff === 'string' && xff.split(',')[0].trim()) ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }
}
