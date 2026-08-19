import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GrupoEstoque } from '../../domain/entities/grupo-estoque.entity';
import { GRUPO_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IGrupoEstoqueRepository } from '../../domain/ports/repositories/grupo-estoque-repository.port';

/**
 * Busca pela identidade no ERP (`id_erp`), nao pelo nosso UUID.
 *
 * Quem integra com o Safira conhece o id de la, nunca o UUID que geramos aqui —
 * sem esta busca a unica saida seria listar tudo e filtrar no cliente. O
 * `buscarPorIdErp` ja existia no repositorio desde 18/08, usado so para
 * detectar duplicata no POST/PATCH; aqui ele vira consulta.
 */
@Injectable()
export class BuscarGrupoEstoquePorIdErpUseCase {
  constructor(
    @Inject(GRUPO_ESTOQUE_REPOSITORY)
    private readonly repo: IGrupoEstoqueRepository,
  ) {}

  async execute(idErp: string): Promise<GrupoEstoque> {
    const registro = await this.repo.buscarPorIdErp(idErp);
    if (!registro) {
      throw new NotFoundException(`Grupo de estoque com id_erp ${idErp} nao encontrado`);
    }
    return registro;
  }
}
