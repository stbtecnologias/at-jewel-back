import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FORNECEDOR_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IFornecedorRepository } from '../../domain/ports/repositories/fornecedor-repository.port';

/**
 * Exclusao FISICA. Espelha os removers de produtos, vendedoras e clientes.
 *
 * O caminho de desligamento do dia a dia e PATCH com `ativo: false`, que tira
 * o fornecedor das selecoes e mantem o historico.
 *
 * Hoje nenhuma FK aponta para `fornecedores`, entao apagar nao afeta outras
 * tabelas. Isso MUDA quando `produtos.fornecedor_id` existir (RF-INT-08): la
 * sera preciso decidir o ON DELETE — SET NULL deixa o produto sem origem,
 * RESTRICT impede apagar fornecedor com produto vinculado.
 */
@Injectable()
export class RemoverFornecedorUseCase {
  constructor(
    @Inject(FORNECEDOR_REPOSITORY)
    private readonly repo: IFornecedorRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) {
      throw new NotFoundException(`Fornecedor ${id} nao encontrado`);
    }
    await this.repo.remover(id);
  }
}
