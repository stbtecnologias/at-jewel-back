import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import { BuscarPerfilUseCase, type PerfilAdmin } from './buscar-perfil.use-case';

@Injectable()
export class AtualizarNomeUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly repo: IAdminUserRepository,
    private readonly buscarPerfil: BuscarPerfilUseCase,
  ) {}

  async execute(id: string, nome: string): Promise<PerfilAdmin> {
    const admin = await this.repo.findById(id);
    if (!admin) throw new NotFoundException('Usuario nao encontrado');
    await this.repo.atualizarNome(id, nome);
    return this.buscarPerfil.execute(id);
  }
}
