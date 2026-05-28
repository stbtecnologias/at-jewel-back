import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class SafiraAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.headers['x-safira-key'] as string | undefined;
    const expected = this.config.get<string>('SAFIRA_API_KEY');

    if (!key || !expected) {
      throw new UnauthorizedException('X-Safira-Key inválida ou ausente');
    }

    // Compara via hash SHA-256 para evitar timing attack baseado em tamanho:
    // hashes tem sempre 32 bytes, entao timingSafeEqual nao vaza informacao
    // por diferenca de comprimento entre o input e o esperado.
    const keyHash = createHash('sha256').update(key).digest();
    const expectedHash = createHash('sha256').update(expected).digest();

    if (!timingSafeEqual(keyHash, expectedHash)) {
      throw new UnauthorizedException('X-Safira-Key inválida ou ausente');
    }

    return true;
  }
}
