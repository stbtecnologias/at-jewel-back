import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUser } from '../../../../domain/entities/admin-user.entity';
import {
  CriarUsuarioInput,
  IAdminUserRepository,
} from '../../../../domain/ports/repositories/admin-user-repository.port';
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

  async listarTodos(): Promise<AdminUser[]> {
    const rows = await this.repo.find({ order: { createdAt: 'ASC' } });
    return rows.map((r) => this.toDomain(r));
  }

  async criarUsuario(input: CriarUsuarioInput): Promise<AdminUser> {
    const row = this.repo.create({
      email: input.email,
      nome: input.nome,
      role: input.role,
      passwordHash: input.passwordHash,
    });
    const saved = await this.repo.save(row);
    return this.toDomain(saved);
  }

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async updateRefreshToken(
    id: string,
    hash: string | null,
    expiresAt: Date | null,
  ): Promise<void> {
    await this.repo.update(id, {
      refreshTokenHash: hash,
      refreshTokenExpiresAt: expiresAt,
    });
  }

  async atualizarNome(id: string, nome: string): Promise<void> {
    await this.repo.update(id, { nome });
  }

  async atualizarSenha(id: string, passwordHash: string): Promise<void> {
    await this.repo.update(id, { passwordHash });
  }

  private toDomain(row: AdminUserOrmEntity): AdminUser {
    return new AdminUser(
      row.id,
      row.email,
      row.passwordHash,
      row.refreshTokenHash,
      row.refreshTokenExpiresAt,
      row.createdAt,
      row.role,
      row.nome,
    );
  }
}
