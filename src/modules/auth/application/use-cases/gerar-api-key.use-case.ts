import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { API_KEY_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IApiKeyRepository } from '../../domain/ports/repositories/api-key-repository.port';
import type { ApiKeyScope } from '../../domain/entities/scopes';

export interface GerarApiKeyResult {
  id: string;
  name: string;
  rawKey: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  createdAt: Date;
}

@Injectable()
export class GerarApiKeyUseCase {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
  ) {}

  async execute(
    name: string,
    createdById: string,
    scopes: ApiKeyScope[] = [],
  ): Promise<GerarApiKeyResult> {
    const rawKey = `sk_live_${randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.substring(0, 12);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.apiKeyRepo.create({
      name,
      keyPrefix,
      keyHash,
      createdById,
      permissions: { scopes },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      rawKey,
      keyPrefix,
      scopes,
      createdAt: apiKey.createdAt,
    };
  }
}
