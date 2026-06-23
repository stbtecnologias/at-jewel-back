import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ROLE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IRoleRepository } from '../../domain/ports/repositories/role-repository.port';
import { PermissionsService } from '../permissions.service';

@Injectable()
export class RemoverRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repo: IRoleRepository,
    private readonly permissions: PermissionsService,
  ) {}

  async execute(chave: string): Promise<void> {
    const role = await this.repo.buscar(chave);
    if (!role) throw new NotFoundException(`Papel ${chave} nao encontrado`);
    if (role.isSystem) {
      throw new ForbiddenException('Papeis de sistema nao podem ser removidos.');
    }
    const emUso = await this.repo.contarUsuarios(chave);
    if (emUso > 0) {
      throw new ConflictException(
        `Papel em uso por ${emUso} usuario(s). Reatribua antes de remover.`,
      );
    }
    await this.repo.remover(chave);
    this.permissions.invalidar();
  }
}
