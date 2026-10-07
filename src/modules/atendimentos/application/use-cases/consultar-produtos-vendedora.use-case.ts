import { Injectable } from '@nestjs/common';
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
    incluirSemEstoque = false,
  ): Promise<ResultadoDeProdutos> {
    const filtro = {
      busca,
      ativo: true,
      apenasDisponiveis: !incluirSemEstoque,
    };

    const [produtos, total, noCatalogo] = await Promise.all([
      this.listar.execute({ ...filtro, limit: MAXIMO }),
      this.listar.contar(filtro),
      // Quantas existem IGNORANDO o saldo. So faz sentido perguntar quando o
      // filtro esta ligado: com ele desligado, e a mesma conta.
      incluirSemEstoque
        ? Promise.resolve(0)
        : this.listar.contar({ ...filtro, apenasDisponiveis: false }),
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
      semEstoque: incluirSemEstoque ? 0 : Math.max(0, noCatalogo - total),
    };
  }
}
