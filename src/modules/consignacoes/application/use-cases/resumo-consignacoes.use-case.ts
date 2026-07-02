import { Inject, Injectable } from '@nestjs/common';
import { CONSIGNACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  IConsignacaoRepository,
  ResumoConsignacoes,
} from '../../domain/ports/repositories/consignacao-repository.port';

@Injectable()
export class ResumoConsignacoesUseCase {
  constructor(
    @Inject(CONSIGNACAO_REPOSITORY)
    private readonly repo: IConsignacaoRepository,
  ) {}

  async execute(): Promise<ResumoConsignacoes> {
    return this.repo.resumo();
  }
}
