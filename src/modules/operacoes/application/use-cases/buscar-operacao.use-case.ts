import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OperacaoEntity } from '../../domain/entities/operacao.entity';
import { OPERACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IOperacaoRepository } from '../../domain/ports/repositories/operacao-repository.port';

@Injectable()
export class BuscarOperacaoUseCase {
  constructor(
    @Inject(OPERACAO_REPOSITORY)
    private readonly repo: IOperacaoRepository,
  ) {}

  async execute(id: string): Promise<OperacaoEntity> {
    const operacao = await this.repo.buscarPorId(id);
    if (!operacao) {
      throw new NotFoundException('Operacao nao encontrada');
    }
    return operacao;
  }
}
