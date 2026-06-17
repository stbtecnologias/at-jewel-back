import { Inject, Injectable } from '@nestjs/common';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import { toUsuarioPublico, UsuarioPublico } from './usuario-publico';

@Injectable()
export class ListarUsuariosUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly repo: IAdminUserRepository,
  ) {}

  async execute(): Promise<UsuarioPublico[]> {
    const usuarios = await this.repo.listarTodos();
    return usuarios.map(toUsuarioPublico);
  }
}
