import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';

/**
 * Exclusao FISICA do cliente. Espelha RemoverProdutoUseCase e
 * RemoverVendedoraUseCase.
 *
 * ATENCAO — o caminho de desligamento do dia a dia e `PATCH /clientes/:id`
 * com `ativo: false`, que preserva tudo.
 *
 * Apagando, duas coisas acontecem e nenhuma levanta erro:
 *
 *   clientes_perfil     ON DELETE CASCADE   -> o perfil da Anastasia some
 *                                              junto: intencao de compra,
 *                                              wishlist, resumo de triagem,
 *                                              notas internas, estado do funil
 *   vendas.cliente_id   ON DELETE SET NULL  -> a receita fica registrada, o
 *                                              vinculo com o cliente se perde
 *
 * O mesmo vale para conversas, agente_eventos e consignacoes. Nada disso e
 * reconstruivel depois.
 *
 * Existe porque a integracao precisa do CRUD completo, decisao registrada em
 * 12/08/2026. Em producao so `produtos` tem dado real; clientes e seed.
 *
 * Efeito colateral util: como `clientes_perfil` cai por CASCADE, esta rota
 * atende de fato um pedido de exclusao LGPD — que era a razao de a migracao 03
 * ter separado as duas tabelas.
 */
@Injectable()
export class RemoverClienteUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly repo: IClienteRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) {
      throw new NotFoundException(`Cliente ${id} nao encontrado`);
    }
    await this.repo.remover(id);
  }
}
