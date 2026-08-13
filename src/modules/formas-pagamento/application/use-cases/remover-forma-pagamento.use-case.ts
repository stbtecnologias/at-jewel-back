import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FORMA_PAGAMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IFormaPagamentoRepository } from '../../domain/ports/repositories/forma-pagamento-repository.port';

/**
 * Exclusao FISICA. Espelha os removers dos demais cadastros.
 *
 * Aqui o desligamento suave (PATCH com `ativo: false`) e quase sempre o certo:
 * forma de pagamento descontinuada precisa continuar existindo para as vendas
 * antigas fazerem sentido.
 *
 * Hoje apagar nao afeta nada — `pagamentos_venda.forma_pagamento` ainda e o
 * ENUM, sem FK para esta tabela. Quando virar FK, apagar forma usada em venda
 * historica passa a ser impedido pelo banco, e sera o comportamento correto.
 */
@Injectable()
export class RemoverFormaPagamentoUseCase {
  constructor(
    @Inject(FORMA_PAGAMENTO_REPOSITORY)
    private readonly repo: IFormaPagamentoRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) {
      throw new NotFoundException(`Forma de pagamento ${id} nao encontrada`);
    }
    await this.repo.remover(id);
  }
}
