import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  aparaIdErp,
  normalizarIdErp,
} from '../../../../shared/erp/normalizar-id-erp';
import { LocalEstoque } from '../../domain/entities/local-estoque.entity';
import { LOCAL_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { ILocalEstoqueRepository } from '../../domain/ports/repositories/local-estoque-repository.port';

export interface AtualizarLocalEstoqueInput {
  idErp?: string | null;
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
    //
    // OS DOIS ANDAM JUNTOS — migracao 65. Campo ausente preserva o par como
    // esta; vindo, o canonico normaliza e o bruto guarda a grafia. Separar os
    // dois deixaria o eco apontando para um id que ja mudou.
    const idErp =
      input.idErp !== undefined ? normalizarIdErp(input.idErp) : atual.idErp;
    const idErpBruto =
      input.idErp !== undefined ? aparaIdErp(input.idErp) : atual.idErpBruto;
    const codigoErp = input.codigoErp !== undefined ? input.codigoErp : atual.codigoErp;

    if (idErp && idErp !== atual.idErp) {
      const dup = await this.repo.buscarPorIdErp(idErp);
      if (dup && dup.id !== id) {
        throw new ConflictException(
          'Ja existe local de estoque com esse id do ERP: ' + dup.id,
        );
      }
    }

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
        idErp,
        idErpBruto,
        codigoErp,
        nome: input.nome ?? atual.nome,
        ativo: input.ativo !== undefined ? input.ativo : atual.ativo,
        criadoEm: atual.criadoEm,
        atualizadoEm: new Date(),
      }),
    );
  }
}
