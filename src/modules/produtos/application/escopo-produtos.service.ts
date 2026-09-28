import { Injectable } from '@nestjs/common';
import { PermissionsService } from '../../auth/application/permissions.service';
import type { OpcoesDeExibicao } from '../../erp/domain/entities/produto.entity';

/**
 * O QUE ESTE USUARIO PODE VER DA PECA — 28/09/2026.
 *
 * ==========================================================================
 * O TERCEIRO SERVICO DA MESMA FAMILIA, E DE PROPOSITO.
 *
 * `EscopoVendasService` e `EscopoClientesService` ja respondiam "que recorte
 * este usuario alcanca". Este responde a pergunta irma — "que CAMPOS este
 * usuario alcanca" — e tem a mesma forma: recebe o usuario do token, consulta
 * `PermissionsService`, devolve um objeto que o controller aplica.
 *
 * Manter a forma importa mais do que parece. Quem for procurar como o sistema
 * decide visibilidade encontra tres arquivos irmaos, com a mesma assinatura,
 * no mesmo lugar da arquitetura. Um `if (role === 'ADMIN')` espalhado pelos
 * controllers responderia igual hoje e divergiria na primeira correcao.
 * ==========================================================================
 *
 * NAO LANCA 403, ao contrario dos outros dois. La, nao ter permissao significa
 * nao ter o que mostrar — carteira de vendedora que nao existe. Aqui a peca
 * existe para todo mundo: quem tem `produtos:read` ve o catalogo, e estas
 * chaves decidem apenas se o custo e o saldo vem junto. Negar a rota inteira
 * tiraria da vendedora o catalogo, que e a ferramenta de trabalho dela.
 */
@Injectable()
export class EscopoProdutosService {
  constructor(private readonly permissions: PermissionsService) {}

  /**
   * As opcoes de serializacao para o `Produto.toPublic`.
   *
   * @param user o payload do JWT. `undefined` quando a chamada veio por API
   *   Key (integrador) — ver `paraIntegrador`.
   */
  async opcoesDe(user: { role: string }): Promise<OpcoesDeExibicao> {
    const [custo, quantidade] = await Promise.all([
      this.permissions.possui(user.role, 'produtos:custo'),
      this.permissions.possui(user.role, 'estoque:quantidade'),
    ]);
    return { custo, quantidade };
  }

  /** `estoque:valor` — o somatorio em R$ do inventario, que e outra pergunta. */
  async podeVerValorDoEstoque(user: { role: string }): Promise<boolean> {
    return this.permissions.possui(user.role, 'estoque:valor');
  }

  /**
   * O INTEGRADOR VE TUDO, e isso nao e excecao a regra — e o outro lado dela.
   *
   * As rotas de produto aceitam JWT **ou** API Key (`JwtOrApiKeyGuard`). Quem
   * entra por API Key e o ERP, que e a FONTE do custo e do saldo: recortar o
   * que ele mesmo manda quebraria a ida e volta da integracao, e nao protegeria
   * nada — o dado ja e dele.
   *
   * A chave e emitida e revogada pela Equipe AT na tela de API Keys, entao a
   * decisao de confiar continua sendo de gente, e nao deste arquivo.
   */
  paraIntegrador(): OpcoesDeExibicao {
    return { custo: true, quantidade: true };
  }
}
