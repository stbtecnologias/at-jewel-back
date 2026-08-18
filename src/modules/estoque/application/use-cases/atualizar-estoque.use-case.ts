import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Estoque } from '../../domain/entities/estoque.entity';
import { ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IEstoqueRepository } from '../../domain/ports/repositories/estoque-repository.port';

export interface AtualizarEstoqueInput {
  quantidade: number;
}

/**
 * Ajuste manual de quantidade. NAO permite trocar empresa, grupo, produto nem
 * local: essas quatro sao a IDENTIDADE do saldo — mudar qualquer uma
 * significa que o saldo e outro, e o caminho e apagar e criar.
 */
@Injectable()
export class AtualizarEstoqueUseCase {
  constructor(
    @Inject(ESTOQUE_REPOSITORY)
    private readonly repo: IEstoqueRepository,
  ) {}

  async execute(id: string, input: AtualizarEstoqueInput): Promise<Estoque> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual) throw new NotFoundException(`Saldo de estoque ${id} nao encontrado`);

    return this.repo.atualizar(
      Estoque.create({
        id: atual.id,
        empresaId: atual.empresaId,
        grupoEstoqueId: atual.grupoEstoqueId,
        produtoId: atual.produtoId,
        codigoErp: atual.codigoErp,
        localEstoqueId: atual.localEstoqueId,
        fornecedorId: atual.fornecedorId,
        clienteId: atual.clienteId,
        vendedoraId: atual.vendedoraId,
        quantidade: input.quantidade,
      }),
    );
  }
}
