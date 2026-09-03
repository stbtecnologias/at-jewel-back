import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OperacaoClasse } from '../../domain/entities/enums';
import { OperacaoEntity } from '../../domain/entities/operacao.entity';
import { OPERACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IOperacaoRepository } from '../../domain/ports/repositories/operacao-repository.port';
import { normalizarIdErp } from '../../../../shared/erp/normalizar-id-erp';

export interface AtualizarOperacaoInput {
  idErp?: string | null;
  codigoErp?: string | null;
  nome?: string;
  classificacao?: OperacaoClasse;
  ativo?: boolean;
}

/**
 * PATCH parcial — a acao de gestao desta tabela.
 *
 * O uso principal e classificar: uma operacao nova chega do ERP como OUTRA e
 * alguem diz o que ela e. Reclassificar muda o que a projecao vai fazer com as
 * movimentacoes daquela operacao — e permitido de proposito (corrigir de-para
 * errado exige isso), mas nao e operacao inocente.
 */
@Injectable()
export class AtualizarOperacaoUseCase {
  constructor(
    @Inject(OPERACAO_REPOSITORY)
    private readonly repo: IOperacaoRepository,
  ) {}

  async execute(
    id: string,
    input: AtualizarOperacaoInput,
  ): Promise<OperacaoEntity> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual) {
      throw new NotFoundException('Operacao nao encontrada');
    }

    const idErp =
      input.idErp === undefined ? atual.idErp : normalizarIdErp(input.idErp);
    if (idErp && idErp !== atual.idErp) {
      const dup = await this.repo.buscarPorIdErp(idErp);
      if (dup && dup.id !== id) {
        throw new ConflictException(
          `Ja existe operacao com esse id do ERP (id: ${dup.id})`,
        );
      }
    }

    const codigoErp =
      input.codigoErp === undefined
        ? atual.codigoErp
        : normalizarIdErp(input.codigoErp);
    if (codigoErp && codigoErp !== atual.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(codigoErp);
      if (dup && dup.id !== id) {
        throw new ConflictException(
          `Ja existe operacao com esse codigo ERP (id: ${dup.id})`,
        );
      }
    }

    const atualizada = OperacaoEntity.create({
      id,
      idErp,
      codigoErp,
      nome: input.nome ?? atual.nome,
      classificacao: input.classificacao ?? atual.classificacao,
      ativo: input.ativo ?? atual.ativo,
    });

    return this.repo.atualizar(atualizada);
  }
}
