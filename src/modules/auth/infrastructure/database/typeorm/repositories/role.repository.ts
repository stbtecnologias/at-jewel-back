import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  CriarRoleCmd,
  IRoleRepository,
  RoleComPermissoes,
} from '../../../../domain/ports/repositories/role-repository.port';
import { AdminUserOrmEntity } from '../entities/admin-user.orm-entity';
import { RoleOrmEntity } from '../entities/role.orm-entity';
import { RolePermissionOrmEntity } from '../entities/role-permission.orm-entity';

@Injectable()
export class RoleRepository implements IRoleRepository {
  constructor(
    @InjectRepository(RoleOrmEntity)
    private readonly roles: Repository<RoleOrmEntity>,
    @InjectRepository(RolePermissionOrmEntity)
    private readonly perms: Repository<RolePermissionOrmEntity>,
    @InjectRepository(AdminUserOrmEntity)
    private readonly usuarios: Repository<AdminUserOrmEntity>,
  ) {}

  async listar(): Promise<RoleComPermissoes[]> {
    const [roles, perms] = await Promise.all([
      this.roles.find({ order: { isSystem: 'DESC', chave: 'ASC' } }),
      this.perms.find(),
    ]);
    const porRole = new Map<string, string[]>();
    for (const p of perms) {
      const lista = porRole.get(p.roleChave) ?? [];
      lista.push(p.permissao);
      porRole.set(p.roleChave, lista);
    }
    return roles.map((r) => this.toDomain(r, porRole.get(r.chave) ?? []));
  }

  async buscar(chave: string): Promise<RoleComPermissoes | null> {
    const role = await this.roles.findOne({ where: { chave } });
    if (!role) return null;
    const perms = await this.perms.find({ where: { roleChave: chave } });
    return this.toDomain(role, perms.map((p) => p.permissao));
  }

  async criar(cmd: CriarRoleCmd): Promise<void> {
    await this.roles.save({
      chave: cmd.chave,
      nome: cmd.nome,
      descricao: cmd.descricao,
      isSystem: false,
    });
    await this.definirPermissoes(cmd.chave, cmd.permissoes);
  }

  async definirPermissoes(chave: string, permissoes: string[]): Promise<void> {
    await this.perms.delete({ roleChave: chave });
    const unicas = [...new Set(permissoes)];
    if (unicas.length > 0) {
      await this.perms.insert(
        unicas.map((permissao) => ({ roleChave: chave, permissao })),
      );
    }
  }

  async atualizarMeta(
    chave: string,
    nome: string,
    descricao: string | null,
  ): Promise<void> {
    await this.roles.update({ chave }, { nome, descricao });
  }

  async remover(chave: string): Promise<void> {
    // role_permissions cai por ON DELETE CASCADE.
    await this.roles.delete({ chave });
  }

  async contarUsuarios(chave: string): Promise<number> {
    return this.usuarios.count({ where: { role: chave } });
  }

  private toDomain(r: RoleOrmEntity, permissoes: string[]): RoleComPermissoes {
    return {
      chave: r.chave,
      nome: r.nome,
      descricao: r.descricao,
      isSystem: r.isSystem,
      permissoes,
    };
  }
}
