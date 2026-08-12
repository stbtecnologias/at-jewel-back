import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { VENDEDORA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';

/**
 * Exclusao FISICA da vendedora. Espelha o RemoverProdutoUseCase.
 *
 * ATENCAO — o caminho normal de desligamento e `PATCH /vendedoras/:id` com
 * `ativo: false`. Vendedora inativa some do matching e das listagens
 * operacionais, e todo o historico permanece atribuido a ela.
 *
 * Este use case apaga a linha. Por ON DELETE SET NULL, as referencias caem
 * para NULL em vez de bloquear: vendas, consignacoes, conversas,
 * agente_eventos e as tres colunas de codigo em clientes/clientes_perfil
 * (FKs da migracao 29). Nenhum erro e levantado — a venda continua existindo
 * com o valor certo, apenas sem dono. Nao ha como reconstruir depois.
 *
 * Existe porque a integracao precisa do CRUD completo, decisao registrada em
 * 12/08/2026. Em producao so `produtos` tem dado real; vendedoras e seed.
 */
@Injectable()
export class RemoverVendedoraUseCase {
  constructor(
    @Inject(VENDEDORA_REPOSITORY)
    private readonly repo: IVendedoraRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) {
      throw new NotFoundException(`Vendedora ${id} nao encontrada`);
    }
    await this.repo.remover(id);
  }
}
