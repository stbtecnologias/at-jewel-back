import { Inject, Injectable } from '@nestjs/common';
import { VENDA_REPOSITORY } from '../../domain/ports/injection-tokens';
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
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
  ) {}

  /**
   * Big-numbers de vendas para o dashboard do gestor. Toda a agregacao roda
   * em SQL no repositorio (sem carregar vendas na memoria). Apenas agregados
   * e ecoa o periodo aplicado — nenhuma PII.
   */
  async execute(
    filtros: Pick<FiltroVenda, 'dataDe' | 'dataAte' | 'vendedoraId' | 'status'>,
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
