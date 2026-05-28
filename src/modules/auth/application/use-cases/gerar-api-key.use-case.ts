import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { API_KEY_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IApiKeyRepository } from '../../domain/ports/repositories/api-key-repository.port';

export interface GerarApiKeyResult {
  id: string;
  name: string;
  rawKey: string;
  keyPrefix: string;
  createdAt: Date;
}

@Injectable()
export class GerarApiKeyUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
  ) {}

  async execute(name: string, createdById: string): Promise<GerarApiKeyResult> {
    const rawKey = `sk_live_${randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.substring(0, 12);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.apiKeyRepo.create({ name, keyPrefix, keyHash, createdById });

    return {
      id: apiKey.id,
      name: apiKey.name,
      rawKey,
      keyPrefix,
      createdAt: apiKey.createdAt,
    };
  }
}
