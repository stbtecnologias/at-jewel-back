import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FormaPagamento as ClassificacaoPagamento } from '../../../vendas/domain/entities/enums';
import { FormaPagamentoEntity } from '../../domain/entities/forma-pagamento.entity';
import { FORMA_PAGAMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IFormaPagamentoRepository } from '../../domain/ports/repositories/forma-pagamento-repository.port';

export interface AtualizarFormaPagamentoInput {
  idErp?: string | null;
  codigoErp?: string | null;
  nome?: string;
  classificacao?: ClassificacaoPagamento;
  ativo?: boolean;
}

@Injectable()
export class AtualizarFormaPagamentoUseCase {
  constructor(
    @Inject(FORMA_PAGAMENTO_REPOSITORY)
    private readonly repo: IFormaPagamentoRepository,
  ) {}

  async execute(
    id: string,
    input: AtualizarFormaPagamentoInput,
  ): Promise<FormaPagamentoEntity> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual) throw new NotFoundException(`Forma de pagamento ${id} nao encontrada`);

    const idErp = input.idErp !== undefined ? input.idErp : atual.idErp;
    const codigoErp = input.codigoErp !== undefined ? input.codigoErp : atual.codigoErp;

    if (idErp && idErp !== atual.idErp) {
      const dupIdErp = await this.repo.buscarPorIdErp(idErp);
      if (dupIdErp && dupIdErp.id !== id) {
        throw new ConflictException(
          'Ja existe forma de pagamento com esse id do ERP: ' + dupIdErp.id,
        );
      }
    }

    if (codigoErp && codigoErp !== atual.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(codigoErp);
      if (dup && dup.id !== id) {
        throw new ConflictException(
          `Ja existe forma de pagamento com esse codigo ERP (id: ${dup.id})`,
        );
      }
    }

    // Mudar a classificacao reclassifica o historico: /analytics/
    // distribuicao-pagamento agrupa por ela, e vendas antigas migram de faixa
    // no relatorio. E permitido de proposito — corrigir um de-para errado da
    // ingestao exige exatamente isso —, mas nao e operacao inocente.
    const atualizado = FormaPagamentoEntity.create({
      id: atual.id,
      idErp,
      codigoErp,
      nome: input.nome ?? atual.nome,
      classificacao: input.classificacao ?? atual.classificacao,
      ativo: input.ativo !== undefined ? input.ativo : atual.ativo,
      criadoEm: atual.criadoEm,
      atualizadoEm: new Date(),
    });

    return this.repo.atualizar(atualizado);
  }
}
