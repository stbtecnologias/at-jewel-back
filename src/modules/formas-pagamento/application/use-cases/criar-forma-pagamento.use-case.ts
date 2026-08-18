import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { FormaPagamento as ClassificacaoPagamento } from '../../../vendas/domain/entities/enums';
import { FormaPagamentoEntity } from '../../domain/entities/forma-pagamento.entity';
import { FORMA_PAGAMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IFormaPagamentoRepository } from '../../domain/ports/repositories/forma-pagamento-repository.port';

export interface CriarFormaPagamentoInput {
  idErp?: string | null;
  codigoErp?: string | null;
  nome: string;
  classificacao: ClassificacaoPagamento;
}

@Injectable()
export class CriarFormaPagamentoUseCase {
  constructor(
    @Inject(FORMA_PAGAMENTO_REPOSITORY)
    private readonly repo: IFormaPagamentoRepository,
  ) {}

  async execute(input: CriarFormaPagamentoInput): Promise<FormaPagamentoEntity> {
    // `id_erp` e a IDENTIDADE no ERP e a chave da sincronizacao — imutavel.
    if (input.idErp) {
      const dupIdErp = await this.repo.buscarPorIdErp(input.idErp);
      if (dupIdErp) {
        throw new ConflictException(
          'Ja existe forma de pagamento com esse id do ERP: ' + dupIdErp.id,
        );
      }
    }

    // `codigo_erp` e UNIQUE e e a chave de idempotencia da sincronizacao.
    if (input.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(input.codigoErp);
      if (dup) {
        throw new ConflictException(
          `Ja existe forma de pagamento com esse codigo ERP (id: ${dup.id})`,
        );
      }
    }

    const forma = FormaPagamentoEntity.create({
      idErp: input.idErp ?? null,
      codigoErp: input.codigoErp ?? null,
      nome: input.nome,
      classificacao: input.classificacao,
      ativo: true,
    });

    return this.repo.criar(forma);
  }
}
