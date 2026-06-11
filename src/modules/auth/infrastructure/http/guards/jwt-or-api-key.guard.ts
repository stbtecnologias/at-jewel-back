import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ValidarApiKeyUseCase } from '../../../application/use-cases/validar-api-key.use-case';
import { ApiKey } from '../../../domain/entities/api-key.entity';
import { SCOPES_KEY } from '../decorators/scopes.decorator';
import { JwtPayload } from '../strategies/jwt.strategy';

/**
 * Autenticação por JWT de staff (painel admin) OU por API key com scope.
 *
 * - Bearer JWT válido (qualquer papel de admin_users) -> libera, popula req.user.
 *   Pensado para o front: o usuário logado usa o próprio token, sem expor chave.
 * - Senão, X-Api-Key válida + o(s) scope(s) exigidos pela rota (@RequireScopes)
 *   -> libera, popula req.apiKey. Pensado para integrações (n8n, scripts).
 * - Nenhuma credencial válida -> 401 (ou 403 se a chave existe mas falta scope).
 *
 * O JWT NÃO é submetido à checagem de scope (staff interno tem acesso pleno);
 * a granularidade por papel pode ser adicionada depois com @Roles, se preciso.
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly validarApiKey: ValidarApiKeyUseCase,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload; apiKey?: ApiKey }>();

    // 1. JWT (Bearer) — staff logado no painel.
    const auth = req.headers['authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const token = auth.slice(7).trim();
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
        req.user = payload;
        return true;
      } catch {
        // Token inválido/expirado: cai para a tentativa de API key.
      }
    }

    // 2. API key (X-Api-Key) — integrações externas.
    const rawKey = req.headers['x-api-key'];
    if (typeof rawKey === 'string' && rawKey) {
      const apiKey = await this.validarApiKey.execute(rawKey);
      if (!apiKey) {
        throw new UnauthorizedException('API Key inválida ou revogada');
      }
      if (apiKey.isExpired()) {
        throw new UnauthorizedException('API Key expirada');
      }

      const required = this.reflector.getAllAndOverride<string[] | undefined>(
        SCOPES_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (required && required.length > 0) {
        const scopes = extrairScopes(apiKey);
        const faltando = required.filter((s) => !scopes.includes(s));
        if (faltando.length > 0) {
          throw new ForbiddenException(
            `API Key sem scopes necessarios: ${faltando.join(', ')}`,
          );
        }
      }

      req.apiKey = apiKey;
      return true;
    }

    // 3. Nenhuma credencial.
    throw new UnauthorizedException(
      'Autenticação necessária: envie um Bearer (JWT) ou X-Api-Key',
    );
  }
}

function extrairScopes(apiKey: ApiKey): string[] {
  const raw = apiKey.permissions?.['scopes'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === 'string');
}
