import { Inject, Injectable } from '@nestjs/common';
import { OperacaoEntity } from '../../domain/entities/operacao.entity';
import { OPERACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroOperacao,
  IOperacaoRepository,
} from '../../domain/ports/repositories/operacao-repository.port';

@Injectable()
export class ListarOperacoesUseCase {
  constructor(
    @Inject(OPERACAO_REPOSITORY)
    private readonly repo: IOperacaoRepository,
  ) {}

  async execute(filtros: FiltroOperacao = {}): Promise<OperacaoEntity[]> {
    return this.repo.listar(filtros);
  }
}
