import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { createHash } from 'crypto';
import { ApiKey } from '../../domain/entities/api-key.entity';
import { API_KEY_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IApiKeyRepository } from '../../domain/ports/repositories/api-key-repository.port';

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ValidarApiKeyUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(rawKey: string): Promise<ApiKey | null> {
    if (!rawKey.startsWith('sk_live_')) return null;

    const hash = createHash('sha256').update(rawKey).digest('hex');
    const cacheKey = `apikey:${hash}`;

    const cached = await this.cache.get<ApiKey>(cacheKey);
    if (cached) return cached;

    const apiKey = await this.apiKeyRepo.findByHash(hash);
    if (!apiKey || !apiKey.isActive) return null;

    await this.cache.set(cacheKey, apiKey, CACHE_TTL_MS);

    // Fire-and-forget: update last used timestamp
    this.apiKeyRepo.updateLastUsed(apiKey.id, new Date()).catch(() => undefined);

    return apiKey;
  }
}
