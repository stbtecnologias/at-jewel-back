import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ROLE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IRoleRepository } from '../../domain/ports/repositories/role-repository.port';
import { permissaoValida } from '../../domain/permissions';
import { PermissionsService } from '../permissions.service';

export interface AtualizarRoleInput {
  nome?: string;
  descricao?: string | null;
  permissoes: string[];
}

@Injectable()
export class AtualizarRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repo: IRoleRepository,
    private readonly permissions: PermissionsService,
  ) {}

  async execute(chave: string, input: AtualizarRoleInput): Promise<void> {
    const role = await this.repo.buscar(chave);
    if (!role) throw new NotFoundException(`Papel ${chave} nao encontrado`);
    if (chave === 'SUPERADMIN') {
      throw new ForbiddenException('O papel SUPERADMIN e protegido.');
    }

    const unicas = [...new Set(input.permissoes)];
    const invalidas = unicas.filter((p) => p === '*' || !permissaoValida(p));
    if (invalidas.length > 0) {
      throw new BadRequestException(`Permissoes invalidas: ${invalidas.join(', ')}`);
    }

    await this.repo.definirPermissoes(chave, unicas);
    // Papeis de sistema mantem nome/descricao; so os customizados editam meta.
    if (!role.isSystem && input.nome) {
      await this.repo.atualizarMeta(chave, input.nome.trim(), input.descricao?.trim() || null);
    }
    this.permissions.invalidar();
  }
}
