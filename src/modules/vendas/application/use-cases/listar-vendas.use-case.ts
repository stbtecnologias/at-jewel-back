import { Inject, Injectable } from '@nestjs/common';
import { VENDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroVenda,
  IVendaRepository,
  VendaResumo,
} from '../../domain/ports/repositories/venda-repository.port';

@Injectable()
export class ListarVendasUseCase {
  constructor(
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
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
