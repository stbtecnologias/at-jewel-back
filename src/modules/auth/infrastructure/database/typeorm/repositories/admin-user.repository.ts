import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUser } from '../../../../domain/entities/admin-user.entity';
import { IAdminUserRepository } from '../../../../domain/ports/repositories/admin-user-repository.port';
import { AdminUserOrmEntity } from '../entities/admin-user.orm-entity';

@Injectable()
export class AdminUserRepository implements IAdminUserRepository {
  constructor(
    @InjectRepository(AdminUserOrmEntity)
    private readonly repo: Repository<AdminUserOrmEntity>,
  ) {}

  async findByEmail(email: string): Promise<AdminUser | null> {
    const row = await this.repo.findOne({ where: { email } });
    return row ? this.toDomain(row) : null;
  }

  async findById(id: string): Promise<AdminUser | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async create(email: string, passwordHash: string): Promise<AdminUser> {
    const row = this.repo.create({ email, passwordHash });
    const saved = await this.repo.save(row);
    return this.toDomain(saved);
  }

  async updateRefreshToken(id: string, hash: string | null): Promise<void> {
    await this.repo.update(id, { refreshTokenHash: hash });
  }

  private toDomain(row: AdminUserOrmEntity): AdminUser {
    return new AdminUser(
      row.id,
      row.email,
      row.passwordHash,
      row.refreshTokenHash,
      row.createdAt,
    );
  }
}
