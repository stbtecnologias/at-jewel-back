import { Inject, Injectable } from '@nestjs/common';
import { VENDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  ComparativoVendedora,
  IVendaRepository,
  RecorteVenda,
} from '../../domain/ports/repositories/venda-repository.port';

/**
 * Comparativo de desempenho por vendedora para a gestao (RF-USU-02). Agrega
 * vendas ativas por vendedora no recorte da tela — periodo, vendedora, status e
 * forma de pagamento. Exposto apenas a quem tem vendas:read_all (controlado no
 * controller). Toda a agregacao roda em SQL.
 */
@Injectable()
export class ComparativoVendedorasUseCase {
  constructor(
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
  ) {}

  async execute(filtros: RecorteVenda): Promise<ComparativoVendedora[]> {
    return this.vendaRepo.comparativoPorVendedora(filtros);
  }
}
