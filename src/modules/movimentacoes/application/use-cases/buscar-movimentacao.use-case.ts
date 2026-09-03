import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Movimentacao } from '../../domain/entities/movimentacao.entity';
import { MOVIMENTACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IMovimentacaoRepository } from '../../domain/ports/repositories/movimentacao-repository.port';

@Injectable()
export class BuscarMovimentacaoUseCase {
  constructor(
    @Inject(MOVIMENTACAO_REPOSITORY)
    private readonly repo: IMovimentacaoRepository,
  ) {}

  async execute(id: string): Promise<Movimentacao> {
    const mov = await this.repo.buscarPorId(id);
    if (!mov) {
      throw new NotFoundException('Movimentacao nao encontrada');
    }
    return mov;
  }
}
