import { Injectable } from '@nestjs/common';
import { categoriaDaBusca } from '../../../../shared/catalogo/categorias';
import { ListarProdutosUseCase } from '../../../produtos/application/use-cases/listar-produtos.use-case';

/** Teto de resultados. Lista longa nao ajuda ninguem numa conversa de WhatsApp. */
const MAXIMO = 6;

/**
 * O que a vendedora ve de um produto.
 *
 * REPARE NO QUE NAO EXISTE AQUI: `valorCusto`, `margemPercentual` — e, desde
 * 25/09/2026, A QUANTIDADE.
 *
 * Nao e omissao do prompt: e ausencia de campo. Como o objeto nao carrega,
 * nenhuma instrucao no meio da conversa faz o modelo revelar o que ele nunca
 * recebeu. Foi assim que custo e margem ficaram de fora em 20/08, e e assim
 * que a quantidade fica agora.
 *
 * ==========================================================================
 * ELA SABE SE TEM, E NAO QUANTO TEM — decisao do Lucas em 25/09/2026.
 *
 *   1  CO25413  COLAR RIVCOROA 16.92 CTS   disponivel     R$ 222.530,00
 *   2  BR26278  BRINCO DTS 1.37 CTS        indisponivel   R$  98.040,00
 *
 * A vendedora precisa responder "tenho essa peca para te mostrar?" — e para
 * isso um booleano basta. Saber que restam duas ou onze e informacao de
 * gestao, e no WhatsApp ela viaja para fora da loja com a mesma facilidade
 * com que chega.
 *
 * O CANAL DO CATALOGO (estoque/marketing) segue a MESMA regra, pela mesma
 * decisao — ver `fichaDaPeca` em `ProcessarFotoCatalogoUseCase`.
 * ==========================================================================
 */
export interface ProdutoParaVendedora {
  descricao: string;
  categoria: string;
  familia: string;
  codigo: string | null;
  precoVenda: number;
  /** Tem saldo na loja? O QUANTO nao sai daqui. */
  disponivel: boolean;
}

/**
 * A amostra e o tamanho real do achado.
 *
 * `total` e quantas o filtro acha de verdade; `produtos` sao as primeiras.
 * `semEstoque` e quantas EXISTEM no catalogo e ficaram de fora por nao ter
 * saldo — sem esse numero, "nao achei nenhuma" e mentira quando o que houve
 * foi "achei 22, todas zeradas".
 */
export interface ResultadoDeProdutos {
  produtos: ProdutoParaVendedora[];
  total: number;
  semEstoque: number;
  /** A lista JA traz as zeradas? Muda o que a agente tem de dizer. */
  incluiuSemEstoque: boolean;
  /** Em que categoria a lista esta. `undefined` = sem recorte. */
  categoria?: string;
  /** Quantas casam com o termo e ficaram FORA por causa da categoria. */
  foraDaCategoria: number;
}

/** O que a pergunta pode recortar. Objeto, e nao argumentos soltos: faixa de preco e pagina entram aqui em seguida. */
export interface OpcoesDeBusca {
  incluirSemEstoque?: boolean;
  /** Vinda da pergunta; passa por `categoriaDaBusca` antes de virar filtro. */
  categoria?: string;
}

/**
 * Consulta de catalogo pela vendedora, no canal interno.
 *
 * Esta e a unica ferramenta do canal que NAO e restrita a ela: catalogo e da
 * loja, nao da carteira. O escopo aqui nao e por pessoa, e por CAMPO — o que
 * sai do banco e maior do que o que sai deste use case.
 */
@Injectable()
export class ConsultarProdutosVendedoraUseCase {
  constructor(private readonly listar: ListarProdutosUseCase) {}

  /**
   * `incluirSemEstoque` e a excecao que a gestao pediu em 07/10: a lista e so
   * do que da para vender, A NAO SER que ela pergunte pelo indisponivel. Quem
   * decide e a pergunta dela, nao o sistema.
   *
   * E volta AMOSTRA + TOTAL, nunca um array solto — a licao da carteira em
   * 21/08/2026, reaprendida no mesmo dia: sem o total, o modelo trata as seis
   * do teto como se fossem o catalogo.
   */
  async execute(
    busca: string,
    opcoes: OpcoesDeBusca = {},
  ): Promise<ResultadoDeProdutos> {
    const incluirSemEstoque = opcoes.incluirSemEstoque === true;
    const categoria = categoriaDaBusca(opcoes.categoria);
    const filtro = {
      busca,
      ativo: true,
      apenasDisponiveis: !incluirSemEstoque,
      categoriaSugerida: categoria,
    };

    // AS DUAS CONTAGENS SEMPRE, e isto foi corrigido no segundo teste de
    // 07/10. Zerar o `semEstoque` quando ela PEDE o indisponivel parecia
    // obvio — nao ha o que "ficar de fora" — e deixou a agente sem o numero
    // justamente na pergunta que era sobre ele:
    //
    //   — "tem alguma esmeralda sem estoque?"
    //   — "As 6 primeiras que apareceram estao todas com estoque, mas sao 112
    //      no total — nao da para afirmar que nenhuma zerou so por essas."
    //
    // Sao 103 zeradas. Ela tinha as 112 e nao tinha o 103.
    const [produtos, total, comSaldo] = await Promise.all([
      this.listar.execute({ ...filtro, limit: MAXIMO }),
      this.listar.contar(filtro),
      this.listar.contar({ ...filtro, apenasDisponiveis: true }),
    ]);
    const [noCatalogo, semRecorte] = await Promise.all([
      incluirSemEstoque
        ? Promise.resolve(total)
        : this.listar.contar({ ...filtro, apenasDisponiveis: false }),
      // QUANTAS A CATEGORIA ESCONDEU. Sem este numero, o padrao JEWEL some
      // uma decoracao sem dizer que sumiu — e seria o mesmo erro do teto sem
      // total, so que com outro nome.
      categoria
        ? this.listar.contar({ ...filtro, categoriaSugerida: undefined })
        : Promise.resolve(total),
    ]);

    const linhas = produtos.map((p) => ({
      descricao: p.descricaoEtiqueta ?? `${p.categoria} ${p.familia}`,
      categoria: p.categoria,
      familia: p.familia,
      codigo: p.codigoErp,
      precoVenda: p.valorVenda,
      // O saldo vem da tabela `estoque` (ver `saldo-do-produto.ts`), e vira
      // um SIM ou NAO aqui — o numero nao atravessa esta fronteira.
      disponivel: p.estoqueAtual > 0,
    }));

    return {
      produtos: linhas,
      total,
      semEstoque: Math.max(0, noCatalogo - comSaldo),
      incluiuSemEstoque: incluirSemEstoque,
      categoria,
      foraDaCategoria: Math.max(0, semRecorte - total),
    };
  }
}
