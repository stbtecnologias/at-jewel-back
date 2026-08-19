import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Fornecedor } from '../../domain/entities/fornecedor.entity';
import { FORNECEDOR_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IFornecedorRepository } from '../../domain/ports/repositories/fornecedor-repository.port';

/**
 * Busca pela identidade no ERP (`id_erp`), nao pelo nosso UUID.
 *
 * Quem integra com o Safira conhece o id de la, nunca o UUID que geramos aqui —
 * sem esta busca a unica saida seria listar tudo e filtrar no cliente. O
 * `buscarPorIdErp` ja existia no repositorio desde 18/08, usado so para
 * detectar duplicata no POST/PATCH; aqui ele vira consulta.
 */
@Injectable()
export class BuscarFornecedorPorIdErpUseCase {
  constructor(
    @Inject(FORNECEDOR_REPOSITORY)
    private readonly repo: IFornecedorRepository,
  ) {}

  async execute(idErp: string): Promise<Fornecedor> {
    const registro = await this.repo.buscarPorIdErp(idErp);
    if (!registro) {
      throw new NotFoundException(`Fornecedor com id_erp ${idErp} nao encontrado`);
    }
    return registro;
  }
}
