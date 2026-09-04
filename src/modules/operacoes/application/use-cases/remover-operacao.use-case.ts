import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OperacaoEmUsoError } from '../../domain/entities/operacao.entity';
import { OPERACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IOperacaoRepository } from '../../domain/ports/repositories/operacao-repository.port';

/**
 * Apaga uma operacao do cadastro.
 *
 * PARA LIMPAR O QUE NAO DEVIA TER ENTRADO — uma operacao cadastrada por engano
 * durante a integracao. Operacao que a loja descontinuou nao se apaga: ela
 * precisa continuar existindo para as movimentacoes historicas fazerem
 * sentido, e o caminho e `PATCH` com `ativo: false`.
 *
 * Por isso o 409 nao e um estorvo a contornar: e a regra funcionando. Se ha
 * movimentacao vinculada, aquela operacao ja e historia de alguem.
 */
@Injectable()
export class RemoverOperacaoUseCase {
  constructor(
    @Inject(OPERACAO_REPOSITORY)
    private readonly repo: IOperacaoRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) {
      throw new NotFoundException('Operacao nao encontrada');
    }

    try {
      await this.repo.remover(id);
    } catch (erro) {
      if (erro instanceof OperacaoEmUsoError) {
        throw new ConflictException(erro.message);
      }
      throw erro;
    }
  }
}
