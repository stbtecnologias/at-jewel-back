import { Inject, Injectable } from '@nestjs/common';
import { CONSIGNACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroConsignacao,
  IConsignacaoRepository,
  ListaConsignacoes,
} from '../../domain/ports/repositories/consignacao-repository.port';

@Injectable()
export class ListarConsignacoesUseCase {
  constructor(
    @Inject(CONSIGNACAO_REPOSITORY)
    private readonly repo: IConsignacaoRepository,
  ) {}

  async execute(filtro: FiltroConsignacao): Promise<ListaConsignacoes> {
    return this.repo.listar(filtro);
  }
}
