import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FormaPagamentoEntity } from '../../domain/entities/forma-pagamento.entity';
import { FORMA_PAGAMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IFormaPagamentoRepository } from '../../domain/ports/repositories/forma-pagamento-repository.port';

@Injectable()
export class BuscarFormaPagamentoUseCase {
  constructor(
    @Inject(FORMA_PAGAMENTO_REPOSITORY)
    private readonly repo: IFormaPagamentoRepository,
  ) {}

  async execute(id: string): Promise<FormaPagamentoEntity> {
    const forma = await this.repo.buscarPorId(id);
    if (!forma) {
      throw new NotFoundException(`Forma de pagamento ${id} nao encontrada`);
    }
    return forma;
  }
}
