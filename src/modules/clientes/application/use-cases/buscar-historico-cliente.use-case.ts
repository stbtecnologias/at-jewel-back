import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { VENDA_REPOSITORY } from '../../../vendas/domain/ports/injection-tokens';
import type {
  HistoricoCliente,
  IVendaRepository,
} from '../../../vendas/domain/ports/repositories/venda-repository.port';
import { CLIENTE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';

@Injectable()
export class BuscarHistoricoClienteUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly clienteRepo: IClienteRepository,
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
  ) {}

  /**
   * Historico de compras de um cliente para o dashboard. Valida que o
   * cliente existe (404 caso contrario) e delega a agregacao ao repositorio
   * de vendas (calculo em SQL, sem N+1). Retorna apenas dados de venda e FKs
   * — nenhuma PII do cliente.
   *
   * O resumo cobre todo o historico CONCLUIDO; a lista (paginavel) inclui
   * todas as vendas ativas do cliente, com o status de cada uma.
   */
  async execute(
    clienteId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<HistoricoCliente> {
    const cliente = await this.clienteRepo.buscarPorId(clienteId);
    if (!cliente) {
      throw new NotFoundException(`Cliente ${clienteId} nao encontrado`);
    }
    return this.vendaRepo.listarHistoricoPorCliente(clienteId, opts);
  }
}
