import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Estoque } from '../../domain/entities/estoque.entity';
import { ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IEstoqueRepository } from '../../domain/ports/repositories/estoque-repository.port';

export interface CriarEstoqueInput {
  codigoErp?: string | null;
  empresaId: string;
  grupoEstoqueId: string;
  produtoId: string;
  localEstoqueId?: string | null;
  fornecedorId?: string | null;
  clienteId?: string | null;
  vendedoraId?: string | null;
  quantidade: number;
}

@Injectable()
export class CriarEstoqueUseCase {
  constructor(
    @Inject(ESTOQUE_REPOSITORY)
    private readonly repo: IEstoqueRepository,
  ) {}

  async execute(input: CriarEstoqueInput): Promise<Estoque> {
    // Invariante do CHECK `chk_estoque_contraparte`, validado aqui para a
    // mensagem sair util em vez de violacao crua do Postgres como 500.
    const contrapartes = Estoque.contarContrapartes(input);
    if (contrapartes !== 1) {
      throw new BadRequestException(
        'Informe exatamente uma contraparte: localEstoqueId, fornecedorId, clienteId ou vendedoraId',
      );
    }

    // `codigo_erp` tambem e UNIQUE. Checar antes devolve 409 util em vez de
    // violacao crua do Postgres como 500.
    if (input.codigoErp) {
      const dupCodigo = await this.repo.buscarPorCodigoErp(input.codigoErp);
      if (dupCodigo) {
        throw new ConflictException(
          `Ja existe saldo com esse codigo ERP (id: ${dupCodigo.id}). ` +
            'Use PUT /estoque para atualizar.',
        );
      }
    }

    // A chave (empresa, grupo, produto, contraparte) e UNIQUE. Checar antes
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
