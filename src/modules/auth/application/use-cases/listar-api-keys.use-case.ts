import { Inject, Injectable } from '@nestjs/common';
import type { ApiKeyPublic } from '../../domain/entities/api-key.entity';
import { API_KEY_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IApiKeyRepository } from '../../domain/ports/repositories/api-key-repository.port';

@Injectable()
export class ListarApiKeysUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
  ) {}

  // Retorna shape publico — sem keyHash. Painel admin so consegue ver
  // o prefixo + scopes; a chave em texto-claro so existe no momento da criacao.
  async execute(): Promise<ApiKeyPublic[]> {
    const apiKeys = await this.apiKeyRepo.findAll();
    return apiKeys.map((k) => k.toPublic());
  }
}
