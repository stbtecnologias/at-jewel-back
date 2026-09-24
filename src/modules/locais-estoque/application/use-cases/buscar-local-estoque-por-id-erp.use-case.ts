import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { normalizarIdErp } from '../../../../shared/erp/normalizar-id-erp';
import { LocalEstoque } from '../../domain/entities/local-estoque.entity';
import { LOCAL_ESTOQUE_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { ILocalEstoqueRepository } from '../../domain/ports/repositories/local-estoque-repository.port';

/**
 * Busca pela identidade no ERP (`id_erp`), nao pelo nosso UUID.
 *
 * Quem integra com o Safira conhece o id de la, nunca o UUID que geramos aqui —
 * sem esta busca a unica saida seria listar tudo e filtrar no cliente. O
 * `buscarPorIdErp` ja existia no repositorio desde 18/08, usado so para
 * detectar duplicata no POST/PATCH; aqui ele vira consulta.
 */
@Injectable()
export class BuscarLocalEstoquePorIdErpUseCase {
  constructor(
    @Inject(LOCAL_ESTOQUE_REPOSITORY)
    private readonly repo: ILocalEstoqueRepository,
  ) {}

  async execute(idErp: string): Promise<LocalEstoque> {
    // NORMALIZA O PARAMETRO — migracao 65. Ele vai colar o que tem em maos, e
    // o que ele tem as vezes vem com zeros ("009000000018") e as vezes vem
    // numerico. Sem isto, a consulta erraria em cima de um registro que
    // existe. Mesma regra do `BuscarMovimentacaoPorIdErpUseCase`.
    const chave = normalizarIdErp(idErp);
    const registro = chave ? await this.repo.buscarPorIdErp(chave) : null;
    if (!registro) {
      throw new NotFoundException(`Local de estoque com id_erp ${idErp} nao encontrado`);
    }
    return registro;
  }
}
