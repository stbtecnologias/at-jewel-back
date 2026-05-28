import { ApiKey } from '../../entities/api-key.entity';

export interface CreateApiKeyData {
  name: string;
  keyPrefix: string;
  keyHash: string;
  createdById: string;
}

export interface IApiKeyRepository {
  findByHash(hash: string): Promise<ApiKey | null>;
  findAll(): Promise<ApiKey[]>;
  findById(id: string): Promise<ApiKey | null>;
  create(data: CreateApiKeyData): Promise<ApiKey>;
  revoke(id: string, revokedAt: Date): Promise<void>;
  updateLastUsed(id: string, at: Date): Promise<void>;
}
