import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FormaPagamentoEntity } from '../../domain/entities/forma-pagamento.entity';
import { FORMA_PAGAMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IFormaPagamentoRepository } from '../../domain/ports/repositories/forma-pagamento-repository.port';

/**
 * Busca pela identidade no ERP (`id_erp`), nao pelo nosso UUID.
 *
 * Quem integra com o Safira conhece o id de la, nunca o UUID que geramos aqui —
 * sem esta busca a unica saida seria listar tudo e filtrar no cliente. O
 * `buscarPorIdErp` ja existia no repositorio desde 18/08, usado so para
 * detectar duplicata no POST/PATCH; aqui ele vira consulta.
 */
@Injectable()
export class BuscarFormaPagamentoPorIdErpUseCase {
  constructor(
    @Inject(FORMA_PAGAMENTO_REPOSITORY)
    private readonly repo: IFormaPagamentoRepository,
  ) {}

  async execute(idErp: string): Promise<FormaPagamentoEntity> {
    const registro = await this.repo.buscarPorIdErp(idErp);
    if (!registro) {
      throw new NotFoundException(`Forma de pagamento com id_erp ${idErp} nao encontrada`);
    }
    return registro;
  }
}
