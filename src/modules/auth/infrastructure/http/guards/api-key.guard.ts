import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKey } from '../../../domain/entities/api-key.entity';
import { ValidarApiKeyUseCase } from '../../../application/use-cases/validar-api-key.use-case';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(ValidarApiKeyUseCase)
    private readonly validarApiKey: ValidarApiKeyUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawKey = request.headers['x-api-key'] as string | undefined;

    if (!rawKey) throw new UnauthorizedException('x-api-key ausente');

    const apiKey = await this.validarApiKey.execute(rawKey);
    if (!apiKey) throw new UnauthorizedException('API Key inválida ou revogada');

    // M-002: rejeita chave expirada. Chave sem expiracao (expiresAt null)
    // nunca expira. A comparacao usa o instante atual a cada request, entao
    // uma chave cacheada que cruza a expiracao ainda e barrada aqui.
    if (apiKey.isExpired()) {
      throw new UnauthorizedException('API Key expirada');
    }

    // Popula a request para o ScopesGuard (que roda em seguida) conseguir
    // ler permissions.scopes. Sem isto, toda rota com @RequireScopes que usa
    // ApiKeyGuard retornava 403 ("API Key nao validada para esta rota").
    (request as Request & { apiKey?: ApiKey }).apiKey = apiKey;

    return true;
  }
}
