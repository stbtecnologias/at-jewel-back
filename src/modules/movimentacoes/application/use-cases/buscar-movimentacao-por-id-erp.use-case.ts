import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { normalizarIdErp } from '../../../../shared/erp/normalizar-id-erp';
import { Movimentacao } from '../../domain/entities/movimentacao.entity';
import { MOVIMENTACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IMovimentacaoRepository } from '../../domain/ports/repositories/movimentacao-repository.port';

/**
 * A rota que o integrador usa para perguntar "esse documento ja chegou?".
 *
 * O parametro passa pelo `normalizarIdErp` porque ele vai colar exatamente o
 * que tem em maos — e o que ele tem em maos as vezes vem com espaco a
 * esquerda ("     1294138"). Sem normalizar, a consulta erraria em cima de um
 * registro que existe.
 */
@Injectable()
export class BuscarMovimentacaoPorIdErpUseCase {
  constructor(
    @Inject(MOVIMENTACAO_REPOSITORY)
    private readonly repo: IMovimentacaoRepository,
  ) {}

  async execute(idErp: string): Promise<Movimentacao> {
    const chave = normalizarIdErp(idErp);
    const mov = chave ? await this.repo.buscarPorIdErp(chave) : null;
    if (!mov) {
      throw new NotFoundException(
        `Movimentacao com id_erp ${idErp} nao encontrada`,
      );
    }
    return mov;
  }
}
