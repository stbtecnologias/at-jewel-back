import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Estoque } from '../../domain/entities/estoque.entity';
import { ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IEstoqueRepository } from '../../domain/ports/repositories/estoque-repository.port';

/**
 * Busca pela identidade no ERP (`id_erp`), nao pelo nosso UUID.
 *
 * Quem integra com o Safira conhece o id de la, nunca o UUID que geramos aqui —
 * sem esta busca a unica saida seria listar tudo e filtrar no cliente. O
 * `buscarPorIdErp` ja existia no repositorio desde 18/08, usado so para
 * detectar duplicata no POST/PATCH; aqui ele vira consulta.
 */
@Injectable()
export class BuscarEstoquePorIdErpUseCase {
  constructor(
    @Inject(ESTOQUE_REPOSITORY)
    private readonly repo: IEstoqueRepository,
  ) {}

  async execute(idErp: string): Promise<Estoque> {
    const registro = await this.repo.buscarPorIdErp(idErp);
    if (!registro) {
      throw new NotFoundException(`Saldo de estoque com id_erp ${idErp} nao encontrado`);
    }
    return registro;
  }
}
