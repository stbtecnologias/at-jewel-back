import { Inject, Injectable } from '@nestjs/common';
import { FormaPagamentoEntity } from '../../domain/entities/forma-pagamento.entity';
import { FORMA_PAGAMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroFormaPagamento,
  IFormaPagamentoRepository,
} from '../../domain/ports/repositories/forma-pagamento-repository.port';

@Injectable()
export class ListarFormasPagamentoUseCase {
  constructor(
    @Inject(FORMA_PAGAMENTO_REPOSITORY)
    private readonly repo: IFormaPagamentoRepository,
  ) {}

  async execute(filtros: FiltroFormaPagamento = {}): Promise<FormaPagamentoEntity[]> {
    return this.repo.listar(filtros);
  }
}
