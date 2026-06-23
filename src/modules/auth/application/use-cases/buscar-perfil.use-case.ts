import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import type { AdminRole } from '../../domain/entities/admin-user.entity';
import { PermissionsService } from '../permissions.service';

export interface PerfilAdmin {
  id: string;
  email: string;
  nome: string | null;
  role: AdminRole;
  /** Permissoes efetivas do papel — usado pelo front para gatear menu/acoes. */
  permissoes: string[];
  /** true se a conta tem senha local; false = acessa apenas via Google. */
  temSenha: boolean;
}

@Injectable()
export class BuscarPerfilUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly repo: IAdminUserRepository,
    private readonly permissions: PermissionsService,
  ) {}

  async execute(id: string): Promise<PerfilAdmin> {
    const admin = await this.repo.findById(id);
    if (!admin) throw new NotFoundException('Usuario nao encontrado');
    return {
      id: admin.id,
      email: admin.email,
      nome: admin.nome,
      role: admin.role,
      permissoes: await this.permissions.permissoesDe(admin.role),
      temSenha: !!admin.passwordHash,
    };
  }
}
