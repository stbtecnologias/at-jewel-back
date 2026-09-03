import { Inject, Injectable } from '@nestjs/common';
import { MOVIMENTACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroMovimentacao,
  IMovimentacaoRepository,
  PaginaMovimentacoes,
} from '../../domain/ports/repositories/movimentacao-repository.port';

@Injectable()
export class ListarMovimentacoesUseCase {
  constructor(
    @Inject(MOVIMENTACAO_REPOSITORY)
    private readonly repo: IMovimentacaoRepository,
  ) {}

  async execute(filtros: FiltroMovimentacao = {}): Promise<PaginaMovimentacoes> {
    return this.repo.listar(filtros);
  }
}
