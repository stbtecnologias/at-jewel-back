import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GrupoEstoque } from '../../domain/entities/grupo-estoque.entity';
import { GRUPO_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IGrupoEstoqueRepository } from '../../domain/ports/repositories/grupo-estoque-repository.port';

export interface AtualizarGrupoEstoqueInput {
  idErp?: string | null;
  codigoErp?: string | null;
  nome?: string;
  ativo?: boolean;
}

@Injectable()
export class AtualizarGrupoEstoqueUseCase {
  constructor(
    @Inject(GRUPO_ESTOQUE_REPOSITORY)
    private readonly repo: IGrupoEstoqueRepository,
  ) {}

  async execute(id: string, input: AtualizarGrupoEstoqueInput): Promise<GrupoEstoque> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual) throw new NotFoundException(`GrupoEstoque ${id} nao encontrada`);

    // `undefined` = campo ausente no PATCH, mantem o atual. `null` = limpar.
    const idErp = input.idErp !== undefined ? input.idErp : atual.idErp;
    const codigoErp = input.codigoErp !== undefined ? input.codigoErp : atual.codigoErp;

    if (idErp && idErp !== atual.idErp) {
      const dup = await this.repo.buscarPorIdErp(idErp);
      if (dup && dup.id !== id) {
        throw new ConflictException(
          'Ja existe grupo de estoque com esse id do ERP: ' + dup.id,
        );
      }
    }

    if (codigoErp && codigoErp !== atual.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(codigoErp);
      if (dup && dup.id !== id) {
        throw new ConflictException(
          `Ja existe grupo de estoque com esse codigo ERP (id: ${dup.id})`,
        );
      }
    }

    return this.repo.atualizar(
      GrupoEstoque.create({
        id: atual.id,
        idErp,
        codigoErp,
        nome: input.nome ?? atual.nome,
        ativo: input.ativo !== undefined ? input.ativo : atual.ativo,
        criadoEm: atual.criadoEm,
        atualizadoEm: new Date(),
      }),
    );
  }
}
