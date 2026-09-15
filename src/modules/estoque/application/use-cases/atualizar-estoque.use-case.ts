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
    if (!atual)
      throw new NotFoundException(`Saldo de estoque ${id} nao encontrado`);

    return this.repo.atualizar(
      Estoque.create({
        id: atual.id,
        // O `idErp` VIAJA JUNTO, e a ausencia dele aqui ERA o defeito.
        //
        // O `atualizar` do repositorio escreve todas as colunas que a entidade
        // carrega. Fora deste remonte, `idErp` nascia `null` e o UPDATE apagava
        // o id do ERP da linha. Relatado pelo integrador em 15/09/2026:
        // "atualizo o estoque e o campo some".
        //
        // O ESTRAGO NAO E COSMETICO: e por `id_erp` que a sincronizacao
        // reconhece a linha. Apagado, o `PUT /estoque` seguinte nao acha mais
        // o registro e cai na chave (empresa+grupo+produto+local) — ou cria
        // uma linha nova, se alguma das quatro tiver mudado.
        //
        // Mesma familia do defeito do upsert de produto (`f134caa`): remontar
        // um registro campo a campo esquece justamente o campo que ninguem
        // digita na tela.
        idErp: atual.idErp,
        empresaId: atual.empresaId,
        grupoEstoqueId: atual.grupoEstoqueId,
        produtoId: atual.produtoId,
        codigoErp: atual.codigoErp,
        localEstoqueId: atual.localEstoqueId,
        quantidade: input.quantidade,
      }),
    );
  }
}
