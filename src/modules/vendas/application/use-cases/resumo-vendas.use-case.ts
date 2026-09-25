import { Inject, Injectable } from '@nestjs/common';
import { VENDAS_LEITURA_REPOSITORY } from '../../domain/ports/repositories/vendas-leitura-repository.port';
import type { IVendasLeituraRepository } from '../../domain/ports/repositories/vendas-leitura-repository.port';
// A LEITURA DA TELA DE VENDAS VEM DA MOVIMENTACAO desde 25/09/2026 — ver
// `vendas-leitura-repository.port.ts`. A tabela `vendas` tem zero linhas.
import type {
  FiltroVenda,
  IVendaRepository,
  ResumoVendas,
} from '../../domain/ports/repositories/venda-repository.port';

export interface ResumoVendasComPeriodo extends ResumoVendas {
  periodo: {
    de: Date | null;
    ate: Date | null;
  };
}

@Injectable()
export class ResumoVendasUseCase {
  constructor(
    @Inject(VENDAS_LEITURA_REPOSITORY)
    private readonly vendaRepo: IVendasLeituraRepository,
  ) {}

  /**
   * Big-numbers de vendas para o dashboard do gestor. Toda a agregacao roda
   * em SQL no repositorio (sem carregar vendas na memoria). Apenas agregados
   * e ecoa o periodo aplicado — nenhuma PII.
   */
  async execute(
    filtros: Pick<
      FiltroVenda,
      'dataDe' | 'dataAte' | 'vendedoraId' | 'status' | 'formaPagamento'
    >,
  ): Promise<ResumoVendasComPeriodo> {
    const resumo = await this.vendaRepo.resumoAgregado(filtros);
    return {
      ...resumo,
      periodo: {
        de: filtros.dataDe ?? null,
        ate: filtros.dataAte ?? null,
      },
    };
  }
}
