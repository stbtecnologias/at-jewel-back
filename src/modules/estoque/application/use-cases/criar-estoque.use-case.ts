import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Estoque } from '../../domain/entities/estoque.entity';
import { ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IEstoqueRepository } from '../../domain/ports/repositories/estoque-repository.port';

export interface CriarEstoqueInput {
  idErp?: string | null;
  codigoErp?: string | null;
  empresaId: string;
  grupoEstoqueId: string;
  produtoId: string;
  localEstoqueId: string;
  quantidade: number;
}

@Injectable()
export class CriarEstoqueUseCase {
  constructor(
    @Inject(ESTOQUE_REPOSITORY)
    private readonly repo: IEstoqueRepository,
  ) {}

  async execute(input: CriarEstoqueInput): Promise<Estoque> {
    // Aqui havia a validacao de "exatamente um dos quatro locais", que existia
    // para o CHECK `chk_estoque_local` nao estourar como 500. A migracao 57
    // deixou um local so, obrigatorio: agora quem recusa e o `@IsUUID()` do
    // DTO, antes de chegar neste ponto.

    // `id_erp` e a IDENTIDADE no ERP e a chave da sincronizacao.
    if (input.idErp) {
      const dupId = await this.repo.buscarPorIdErp(input.idErp);
      if (dupId) {
        throw new ConflictException(
          'Ja existe saldo com esse id do ERP: ' +
            dupId.id +
            '. Use PUT /estoque para atualizar.',
        );
      }
    }

    // A chave (empresa, grupo, produto, local) e UNIQUE. Checar antes
    // devolve 409 com o id do saldo existente — quem quer somar/substituir
    // deve usar o PUT de sincronizacao, que faz upsert.
    const existente = await this.repo.buscarPorChave(input);
    if (existente) {
      throw new ConflictException(
        `Ja existe saldo para essa combinacao (id: ${existente.id}). ` +
          'Use PUT /estoque para atualizar a quantidade.',
      );
    }

    return this.repo.criar(
      Estoque.create({
        ...input,
        // Negativo e valido: e o que a casa deve (partida dobrada).
        quantidade: input.quantidade,
      }),
    );
  }
}
