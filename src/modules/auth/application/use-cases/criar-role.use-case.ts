import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ROLE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IRoleRepository } from '../../domain/ports/repositories/role-repository.port';
import { permissaoValida } from '../../domain/permissions';
import { PermissionsService } from '../permissions.service';

const CHAVE_REGEX = /^[A-Z][A-Z0-9_]{2,39}$/;

export interface CriarRoleInput {
  chave: string;
  nome: string;
  descricao?: string | null;
  permissoes: string[];
}

@Injectable()
export class CriarRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repo: IRoleRepository,
    private readonly permissions: PermissionsService,
  ) {}

  async execute(input: CriarRoleInput): Promise<void> {
    const chave = input.chave.trim().toUpperCase();
    if (!CHAVE_REGEX.test(chave)) {
      throw new BadRequestException(
        'Chave invalida. Use 3-40 caracteres: A-Z, 0-9 e _ (comecando por letra).',
      );
    }
    if (await this.repo.buscar(chave)) {
      throw new ConflictException(`Ja existe um papel com a chave ${chave}`);
    }
    const permissoes = this.validarPermissoes(input.permissoes);

    await this.repo.criar({
      chave,
      nome: input.nome.trim(),
      descricao: input.descricao?.trim() || null,
      permissoes,
    });
    this.permissions.invalidar();
  }

  private validarPermissoes(permissoes: string[]): string[] {
    const unicas = [...new Set(permissoes)];
    // O curinga '*' e exclusivo do SUPERADMIN — nao pode ser concedido aqui.
    const invalidas = unicas.filter((p) => p === '*' || !permissaoValida(p));
    if (invalidas.length > 0) {
      throw new BadRequestException(
        `Permissoes invalidas: ${invalidas.join(', ')}`,
      );
    }
    return unicas;
  }
}
