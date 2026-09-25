import { Inject, Injectable } from '@nestjs/common';
import { VENDAS_LEITURA_REPOSITORY } from '../../domain/ports/repositories/vendas-leitura-repository.port';
import type { IVendasLeituraRepository } from '../../domain/ports/repositories/vendas-leitura-repository.port';
// A LEITURA DA TELA DE VENDAS VEM DA MOVIMENTACAO desde 25/09/2026 — ver
// `vendas-leitura-repository.port.ts`. A tabela `vendas` tem zero linhas.
import type {
  FiltroVenda,
  IVendaRepository,
  VendaResumo,
} from '../../domain/ports/repositories/venda-repository.port';

@Injectable()
export class ListarVendasUseCase {
  constructor(
    @Inject(VENDAS_LEITURA_REPOSITORY)
    private readonly vendaRepo: IVendasLeituraRepository,
  ) {}

  /**
   * Lista vendas (read-model enriquecido) com filtros (periodo, cliente,
   * vendedora, status, forma de pagamento) e paginacao. NAO carrega o
   * agregado completo — quem precisar do detalhe chama BuscarVenda.
   */
  async execute(filtros: FiltroVenda): Promise<VendaResumo[]> {
    return this.vendaRepo.listar(filtros);
  }
}
