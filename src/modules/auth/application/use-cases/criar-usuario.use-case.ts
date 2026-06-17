import { ConflictException, Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import { AdminRole } from '../../domain/entities/admin-user.entity';
import { toUsuarioPublico, UsuarioPublico } from './usuario-publico';

export interface CriarUsuarioCmd {
  email: string;
  nome?: string | null;
  role: AdminRole;
  // Senha inicial opcional. Se ausente, o usuario so entra via Google.
  senha?: string | null;
}

@Injectable()
export class CriarUsuarioUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly repo: IAdminUserRepository,
  ) {}

  async execute(cmd: CriarUsuarioCmd): Promise<UsuarioPublico> {
    const email = cmd.email.toLowerCase().trim();

    const existente = await this.repo.findByEmail(email);
    if (existente) {
      throw new ConflictException('Já existe um usuário com este e-mail');
    }

    const passwordHash = cmd.senha ? await bcrypt.hash(cmd.senha, 12) : null;

    const usuario = await this.repo.criarUsuario({
      email,
      nome: cmd.nome?.trim() || null,
      role: cmd.role,
      passwordHash,
    });

    return toUsuarioPublico(usuario);
  }
}
