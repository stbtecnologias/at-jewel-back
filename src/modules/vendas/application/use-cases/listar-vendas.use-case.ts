import { Inject, Injectable } from '@nestjs/common';
import { Venda } from '../../domain/entities/venda.entity';
import { VENDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FiltroVenda,
  IVendaRepository,
} from '../../domain/ports/repositories/venda-repository.port';

@Injectable()
export class ListarVendasUseCase {
  constructor(
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
  ) {}

  /**
   * Lista vendas com filtros (periodo, cliente, vendedora, status) e
   * paginacao. NAO carrega itens/pagamentos — quem precisar do detalhe
   * chama BuscarVenda.
   */
  async execute(filtros: FiltroVenda): Promise<Venda[]> {
    return this.vendaRepo.listar(filtros);
  }
}
