import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiKey } from '../../../domain/entities/api-key.entity';
import { SCOPES_KEY } from '../decorators/scopes.decorator';

/**
 * Le os scopes exigidos pela rota (via @RequireScopes) e compara contra
 * permissions.scopes da API Key validada pelo ApiKeyGuard.
 *
 * IMPORTANTE: aplicar SEMPRE depois do ApiKeyGuard — este guard depende
 * de `request.apiKey` ser populado por aquele.
 */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { apiKey?: ApiKey }>();
    const apiKey = req.apiKey;
    if (!apiKey) {
      throw new ForbiddenException('API Key nao validada para esta rota');
    }

    const scopes = extrairScopes(apiKey);

    // ALL scopes required — politica restritiva. Para OR usar metadados extras.
    const faltando = required.filter((s) => !scopes.includes(s));
    if (faltando.length > 0) {
      throw new ForbiddenException(
        `API Key sem scopes necessarios: ${faltando.join(', ')}`,
      );
    }

    return true;
  }
}

function extrairScopes(apiKey: ApiKey): string[] {
  const raw = apiKey.permissions?.['scopes'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === 'string');
}
