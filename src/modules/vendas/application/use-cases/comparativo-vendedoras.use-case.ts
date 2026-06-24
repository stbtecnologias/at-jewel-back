import { Inject, Injectable } from '@nestjs/common';
import { VENDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  ComparativoVendedora,
  FiltroVenda,
  IVendaRepository,
} from '../../domain/ports/repositories/venda-repository.port';

/**
 * Comparativo de desempenho por vendedora para a gestao (RF-USU-02). Agrega
 * vendas concluidas/ativas por vendedora no recorte. Exposto apenas a quem tem
 * vendas:read_all (controlado no controller). Toda a agregacao roda em SQL.
 */
@Injectable()
export class ComparativoVendedorasUseCase {
  constructor(
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
  ) {}

  async execute(
    filtros: Pick<FiltroVenda, 'dataDe' | 'dataAte'>,
  ): Promise<ComparativoVendedora[]> {
    return this.vendaRepo.comparativoPorVendedora(filtros);
  }
}
