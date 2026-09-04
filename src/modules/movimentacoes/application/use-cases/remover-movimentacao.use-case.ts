import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MOVIMENTACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IMovimentacaoRepository } from '../../domain/ports/repositories/movimentacao-repository.port';

/**
 * Apaga um documento inteiro — cabecalho, itens e pagamentos.
 *
 * PARA UM CASO SO: documento que nao devia ter entrado, tipicamente um
 * `idErpMovimentacao` digitado errado que criou um fantasma. Corrigir dado e
 * trabalho do PUT, que substitui o agregado; cancelar venda e `ativo: false`,
 * que vem do proprio ERP.
 *
 * BUSCA ANTES DE APAGAR, e nao e cerimonia: sem isso, apagar um id que nao
 * existe devolveria 204 e quem chamou acreditaria ter apagado alguma coisa.
 * Num endpoint destrutivo, "nao achei" precisa ser dito.
 */
@Injectable()
export class RemoverMovimentacaoUseCase {
  constructor(
    @Inject(MOVIMENTACAO_REPOSITORY)
    private readonly repo: IMovimentacaoRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) {
      throw new NotFoundException('Movimentacao nao encontrada');
    }
    await this.repo.remover(id);
  }
}
