import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * Protege o webhook do WAHA com um token compartilhado, enviado no header
 * `X-Webhook-Token`. Mesmo padrao do SafiraAuthGuard (comparacao via hash
 * SHA-256 + timingSafeEqual, evitando timing attack por diferenca de tamanho).
 * Config: env WHATSAPP_WEBHOOK_TOKEN (o mesmo valor configurado no WAHA).
 */
@Injectable()
export class WahaAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-webhook-token'] as string | undefined;
    const expected = this.config.get<string>('WHATSAPP_WEBHOOK_TOKEN');

    if (!token || !expected) {
      throw new UnauthorizedException('X-Webhook-Token inválido ou ausente');
    }

    const tokenHash = createHash('sha256').update(token).digest();
    const expectedHash = createHash('sha256').update(expected).digest();

    if (!timingSafeEqual(tokenHash, expectedHash)) {
      throw new UnauthorizedException('X-Webhook-Token inválido ou ausente');
    }

    return true;
  }
}
