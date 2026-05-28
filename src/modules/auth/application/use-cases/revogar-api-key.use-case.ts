import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { API_KEY_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IApiKeyRepository } from '../../domain/ports/repositories/api-key-repository.port';

@Injectable()
export class RevogarApiKeyUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(id: string): Promise<void> {
    const apiKey = await this.apiKeyRepo.findById(id);
    if (!apiKey) throw new NotFoundException('API Key não encontrada');

    await this.apiKeyRepo.revoke(id, new Date());
    await this.cache.del(`apikey:${apiKey.keyHash}`);
  }
}
