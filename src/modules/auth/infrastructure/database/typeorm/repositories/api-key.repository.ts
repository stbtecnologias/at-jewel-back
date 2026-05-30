import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../../../../domain/entities/api-key.entity';
import {
  CreateApiKeyData,
  IApiKeyRepository,
} from '../../../../domain/ports/repositories/api-key-repository.port';
import { ApiKeyOrmEntity } from '../entities/api-key.orm-entity';

@Injectable()
export class ApiKeyRepository implements IApiKeyRepository {
  constructor(
    @InjectRepository(ApiKeyOrmEntity)
    private readonly repo: Repository<ApiKeyOrmEntity>,
  ) {}

  async findByHash(hash: string): Promise<ApiKey | null> {
    const row = await this.repo.findOne({ where: { keyHash: hash } });
    return row ? this.toDomain(row) : null;
  }

  async findAll(): Promise<ApiKey[]> {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
    return rows.map((r) => this.toDomain(r));
  }

  async findById(id: string): Promise<ApiKey | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async create(data: CreateApiKeyData): Promise<ApiKey> {
    const row = this.repo.create({
      name: data.name,
      keyPrefix: data.keyPrefix,
      keyHash: data.keyHash,
      createdById: data.createdById,
      permissions: data.permissions ?? {},
    });
    const saved = await this.repo.save(row);
    return this.toDomain(saved);
  }

  async revoke(id: string, revokedAt: Date): Promise<void> {
    await this.repo.update(id, { isActive: false, revokedAt });
  }

  async updateLastUsed(id: string, at: Date): Promise<void> {
    await this.repo.update(id, { lastUsedAt: at });
  }

  private toDomain(row: ApiKeyOrmEntity): ApiKey {
    return new ApiKey(
      row.id,
      row.name,
      row.keyPrefix,
      row.keyHash,
      row.permissions,
      row.isActive,
      row.lastUsedAt,
      row.createdById,
      row.createdAt,
      row.revokedAt,
    );
  }
}
