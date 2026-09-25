import { Inject, Injectable } from '@nestjs/common';
import { VENDAS_LEITURA_REPOSITORY } from '../../domain/ports/repositories/vendas-leitura-repository.port';
import type { IVendasLeituraRepository } from '../../domain/ports/repositories/vendas-leitura-repository.port';
// A LEITURA DA TELA DE VENDAS VEM DA MOVIMENTACAO desde 25/09/2026 — ver
// `vendas-leitura-repository.port.ts`. A tabela `vendas` tem zero linhas.
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
    @Inject(VENDAS_LEITURA_REPOSITORY)
    private readonly vendaRepo: IVendasLeituraRepository,
  ) {}

  async execute(filtros: RecorteVenda): Promise<ComparativoVendedora[]> {
    return this.vendaRepo.comparativoPorVendedora(filtros);
  }
}
