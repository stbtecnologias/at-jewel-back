import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PermissionsService } from '../../auth/application/permissions.service';
import { VENDA_REPOSITORY } from '../domain/ports/injection-tokens';
import type { IVendaRepository } from '../domain/ports/repositories/venda-repository.port';

/**
 * Isolamento de dados por vendedora (RF-USU-02). Decide, a partir do usuario
 * autenticado, QUE VENDAS ele alcanca.
 *
 * ==========================================================================
 * TRES ESTADOS DESDE 29/09/2026, E NAO MAIS DOIS.
 *
 * Ate aqui era binario: ou a pessoa via a loja inteira (`vendas:read_all`), ou
 * via so a propria carteira. O documento de requisitos de 28/09 introduziu o
 * meio — a gerente ve o desempenho DA EQUIPE DELA, e nao o da loja (RF-06 e
 * RF-08).
 *
 *   undefined  -> a loja inteira            (Equipe AT)
 *   [id]       -> a propria carteira        (vendedora)
 *   [a, b, c]  -> as vendedoras da equipe   (gerente)
 *
 * A LISTA SE PROPAGA SOZINHA. Resumo, serie mensal, comparativo e listagem ja
 * recebiam `vendedoraId` como array e filtram com `= ANY($n::uuid[])` — entao
 * o recorte novo nao pediu uma linha de SQL nova. Foi o desenho de 11/09, que
 * trocou o valor unico por lista para o filtro da tela, que pagou por isto.
 * ==========================================================================
 */
@Injectable()
export class EscopoVendasService {
  constructor(
    private readonly permissions: PermissionsService,
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
  ) {}

  /**
   * Retorna o vendedoraId ao qual o usuario esta restrito, ou `undefined`
   * quando ele pode ver a carteira inteira (vendas:read_all). Lanca 403 quando
   * o usuario NAO tem vendas:read_all e tambem nao esta vinculado a uma
   * vendedora — nesse caso nao ha carteira "propria" a exibir.
   */
  async vendedoraIdRestrito(user: {
    sub: string;
    role: string;
  }): Promise<string | undefined> {
    if (await this.permissions.possui(user.role, 'vendas:read_all')) {
      return undefined;
    }
    const vendedoraId = await this.vendaRepo.resolverVendedoraIdPorAdminUser(
      user.sub,
    );
    if (!vendedoraId) {
      throw new ForbiddenException(
        'Usuário não está vinculado a uma vendedora; acesso às vendas negado.',
      );
    }
    return vendedoraId;
  }

  /**
   * O recorte COMPLETO — a forma que os controllers passaram a usar.
   *
   * ========================================================================
   * A ORDEM DAS TRES PERGUNTAS E O QUE DEFINE A REGRA.
   *
   *   1. Tem equipe?           -> so as vendedoras dela
   *   2. Tem `vendas:read_all`? -> a loja inteira
   *   3. senao                  -> a propria carteira (ou 403)
   *
   * A EQUIPE VEM PRIMEIRO, E NAO POR ACASO. A gerente tem `vendas:read_all`
   * (e o que a deixa ver mais de uma vendedora) — se a pergunta da permissao
   * viesse antes, ela cairia em "a loja inteira" e o recorte de equipe nunca
   * seria consultado. Seria exatamente o defeito que este metodo existe para
   * impedir, e sem nada acusando: ela veria numeros maiores e plausiveis.
   *
   * A mesma inversao protege o contrario: uma ADMIN sem equipe continua vendo
   * a loja, porque a primeira pergunta devolve `null` para ela.
   * ========================================================================
   */
  async recorteDeVendas(user: {
    sub: string;
    role: string;
  }): Promise<string[] | undefined> {
    const daEquipe = await this.vendaRepo.vendedorasDaEquipeDoUsuario(user.sub);
    // `[]` — equipe cadastrada e vazia — passa por aqui e vira recorte que nao
    // devolve nada. E o correto: o time dela nao vendeu porque nao tem
    // ninguem. So `null` (sem equipe) segue para a regra antiga.
    if (daEquipe !== null) return daEquipe;

    const restrito = await this.vendedoraIdRestrito(user);
    return restrito === undefined ? undefined : [restrito];
  }
}
