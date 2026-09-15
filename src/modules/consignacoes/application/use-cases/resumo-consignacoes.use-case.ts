import { Inject, Injectable } from '@nestjs/common';
import { CONSIGNACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroConsignacao,
  IConsignacaoRepository,
  ResumoConsignacoes,
} from '../../domain/ports/repositories/consignacao-repository.port';

@Injectable()
export class ResumoConsignacoesUseCase {
  constructor(
    @Inject(CONSIGNACAO_REPOSITORY)
    private readonly repo: IConsignacaoRepository,
  ) {}

  /** Sem recorte, a casa inteira; com recorte, o mesmo filtro da lista. */
  async execute(
    filtro?: Omit<FiltroConsignacao, 'limit' | 'offset'>,
  ): Promise<ResumoConsignacoes> {
    return this.repo.resumo(filtro);
  }
}
