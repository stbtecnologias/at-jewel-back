import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LocalEstoque } from '../../domain/entities/local-estoque.entity';
import { LOCAL_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { ILocalEstoqueRepository } from '../../domain/ports/repositories/local-estoque-repository.port';

export interface AtualizarLocalEstoqueInput {
  codigoErp?: string | null;
  nome?: string;
  ativo?: boolean;
}

@Injectable()
export class AtualizarLocalEstoqueUseCase {
  constructor(
    @Inject(LOCAL_ESTOQUE_REPOSITORY)
    private readonly repo: ILocalEstoqueRepository,
  ) {}

  async execute(id: string, input: AtualizarLocalEstoqueInput): Promise<LocalEstoque> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual) throw new NotFoundException(`LocalEstoque ${id} nao encontrada`);

    // `undefined` = campo ausente no PATCH, mantem o atual. `null` = limpar.
    const codigoErp = input.codigoErp !== undefined ? input.codigoErp : atual.codigoErp;

    if (codigoErp && codigoErp !== atual.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(codigoErp);
      if (dup && dup.id !== id) {
        throw new ConflictException(
          `Ja existe local de estoque com esse codigo ERP (id: ${dup.id})`,
        );
      }
    }

    return this.repo.atualizar(
      LocalEstoque.create({
        id: atual.id,
        codigoErp,
        nome: input.nome ?? atual.nome,
        ativo: input.ativo !== undefined ? input.ativo : atual.ativo,
        criadoEm: atual.criadoEm,
        atualizadoEm: new Date(),
      }),
    );
  }
}
