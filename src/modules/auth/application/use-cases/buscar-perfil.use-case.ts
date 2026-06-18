import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import type { AdminRole } from '../../domain/entities/admin-user.entity';

export interface PerfilAdmin {
  id: string;
  email: string;
  nome: string | null;
  role: AdminRole;
  /** true se a conta tem senha local; false = acessa apenas via Google. */
  temSenha: boolean;
}

@Injectable()
export class BuscarPerfilUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly repo: IAdminUserRepository,
  ) {}

  async execute(id: string): Promise<PerfilAdmin> {
    const admin = await this.repo.findById(id);
    if (!admin) throw new NotFoundException('Usuario nao encontrado');
    return {
      id: admin.id,
      email: admin.email,
      nome: admin.nome,
      role: admin.role,
      temSenha: !!admin.passwordHash,
    };
  }
}
