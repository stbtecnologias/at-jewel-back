import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { OperacaoClasse } from '../../domain/entities/enums';
import { OperacaoEntity } from '../../domain/entities/operacao.entity';
import { OPERACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IOperacaoRepository } from '../../domain/ports/repositories/operacao-repository.port';
import { normalizarIdErp } from '../../../../shared/erp/normalizar-id-erp';

export interface CriarOperacaoInput {
  idErp?: string | null;
  codigoErp?: string | null;
  nome: string;
  classificacao?: OperacaoClasse;
}

@Injectable()
export class CriarOperacaoUseCase {
  constructor(
    @Inject(OPERACAO_REPOSITORY)
    private readonly repo: IOperacaoRepository,
  ) {}

  async execute(input: CriarOperacaoInput): Promise<OperacaoEntity> {
    const idErp = normalizarIdErp(input.idErp);
    const codigoErp = normalizarIdErp(input.codigoErp);

    if (idErp) {
      const dup = await this.repo.buscarPorIdErp(idErp);
      if (dup) {
        throw new ConflictException(
          `Ja existe operacao com esse id do ERP (id: ${dup.id})`,
        );
      }
    }

    if (codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(codigoErp);
      if (dup) {
        throw new ConflictException(
          `Ja existe operacao com esse codigo ERP (id: ${dup.id})`,
        );
      }
    }

    const operacao = OperacaoEntity.create({
      idErp,
      codigoErp,
      nome: input.nome,
      // Default OUTRA: operacao nova entra inerte e alguem classifica. O nome
      // e do ERP e nao e vocabulario nosso — adivinhar por ele poria receita
      // no lugar errado sem nenhum aviso.
      classificacao: input.classificacao ?? 'OUTRA',
      ativo: true,
    });

    return this.repo.criar(operacao);
  }
}
