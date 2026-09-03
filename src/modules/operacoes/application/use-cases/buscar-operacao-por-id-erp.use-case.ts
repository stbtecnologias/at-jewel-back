import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { normalizarIdErp } from '../../../../shared/erp/normalizar-id-erp';
import { OperacaoEntity } from '../../domain/entities/operacao.entity';
import { OPERACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IOperacaoRepository } from '../../domain/ports/repositories/operacao-repository.port';

/**
 * Busca pela identidade no ERP, nao pelo nosso UUID — a rota que a revisao de
 * 19/08 da documentacao do integrador padronizou em todos os recursos.
 *
 * Quem integra com o Safira conhece o id de la e nunca o UUID que geramos
 * aqui; sem esta busca a unica saida seria listar tudo e filtrar do lado dele.
 *
 * O parametro passa pelo `normalizarIdErp` porque o proprio ERP manda o mesmo
 * identificador com padding em umas tabelas e sem em outras — quem consulta
 * costuma colar exatamente o que recebeu.
 */
@Injectable()
export class BuscarOperacaoPorIdErpUseCase {
  constructor(
    @Inject(OPERACAO_REPOSITORY)
    private readonly repo: IOperacaoRepository,
  ) {}

  async execute(idErp: string): Promise<OperacaoEntity> {
    const chave = normalizarIdErp(idErp);
    const operacao = chave ? await this.repo.buscarPorIdErp(chave) : null;
    if (!operacao) {
      throw new NotFoundException(
        `Operacao com id_erp ${idErp} nao encontrada`,
      );
    }
    return operacao;
  }
}
