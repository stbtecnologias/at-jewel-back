import { Inject, Injectable } from '@nestjs/common';
import { ApiKey } from '../../domain/entities/api-key.entity';
import { API_KEY_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IApiKeyRepository } from '../../domain/ports/repositories/api-key-repository.port';

@Injectable()
export class ListarApiKeysUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
  ) {}

  async execute(): Promise<ApiKey[]> {
    return this.apiKeyRepo.findAll();
  }
}
