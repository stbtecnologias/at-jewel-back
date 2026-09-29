/**
 * A VENDA LIDA DE ONDE ELA REALMENTE ESTA — 25/09/2026.
 *
 * ==========================================================================
 * A TABELA `vendas` NAO E MAIS A FONTE. DECISAO DO LUCAS.
 *
 * Em 25/09 a copia de producao mostrou 1.388 documentos de movimentacao —
 * 1.287 VENDA e 101 DEVOLUCAO, de junho/2023 a setembro/2026, R$ 66,2 milhoes
 * — com cliente, vendedora, operacao e empresa resolvidos em TODOS, e 2.163
 * itens apontando para produtos do catalogo.
 *
 * A tabela `vendas` tem ZERO linhas. Todo o painel le `vendas`: as telas de
 * Vendas e Analytics, Top produtos, Top vendedoras, metas, os giros, e as
 * ferramentas das agentes. Por isso a loja parece nao ter vendido nada tendo
 * tres anos de historico no banco.
 *
 * O caminho escolhido NAO e projetar movimentacao em `vendas`: e a leitura
 * migrar para ca. Esta porta e o primeiro pedaco dessa migracao, e nasce
 * atendendo as agentes — o que o Lucas pediu primeiro — com a forma que as
 * TELAS vao reusar depois.
 * ==========================================================================
 *
 * A DEVOLUCAO ABATE, e nao e detalhe: sao 101 documentos e R$ 4,0 milhoes.
 * Somando so as saidas, todo numero que a agente responde sai ~6% acima do
 * real — e ninguem desconfia de um numero que parece plausivel.
 */

/** O recorte de tempo. Sempre fechado dos dois lados. */
export interface JanelaDeVendas {
  de: Date;
  /** INCLUSIVO — quem monta a janela ja poe o fim do dia. */
  ate: Date;
}

export interface ResumoDeVendas {
  /** Documentos de VENDA no periodo. */
  quantidade: number;
  /** Saidas MENOS devolucoes. */
  receita: number;
  /** Receita liquida dividida pela quantidade de vendas. 0 quando nao ha. */
  ticketMedio: number;
  devolucoes: number;
  valorDevolvido: number;
}

export interface VendedoraNoRanking {
  vendedoraId: string;
  nome: string;
  codigoErp: string | null;
  quantidade: number;
  valor: number;
}

export interface ItemMaisVendido {
  produtoId: string;
  codigoErp: string | null;
  descricao: string | null;
  familia: string | null;
  /** Soma das quantidades — pode ser fracionaria (o ERP usa NUMERIC). */
  quantidade: number;
  valor: number;
}

/** Uma vendedora no ranking de um tipo de peca. Ver `rankingPorFamilia`. */
export interface VendedoraPorFamilia {
  vendedoraId: string;
  nome: string;
  /** Pecas daquela familia, com a devolucao ja abatida. */
  quantidade: number;
  valor: number;
}

/** A mesma linha, carimbada com o ano. Ver `rankingPorFamiliaNoMes`. */
export interface VendedoraPorFamiliaNoAno extends VendedoraPorFamilia {
  ano: number;
}

/** Uma linha da comparação ano a ano. */
export interface ComparacaoAnual {
  ano: number;
  /** Receita do recorte até o dia do corte (ou do recorte inteiro, sem corte). */
  receita: number;
  quantidade: number;
  /** O recorte FECHADO. Igual a `receita` quando não houve corte. */
  receitaFechada: number | null;
}

export interface IVendasMovimentacaoRepository {
  /**
   * O resumo do periodo. Com `vendedoraId`, so o dela — e e assim que a
   * vendedora ve as PROPRIAS vendas, sem enxergar a equipe.
   */
  resumo(
    janela: JanelaDeVendas,
    vendedoraId?: string | null,
  ): Promise<ResumoDeVendas>;

  /** Quem vendeu mais no periodo. So quem teve venda aparece. */
  rankingDeVendedoras(
    janela: JanelaDeVendas,
    limite: number,
  ): Promise<VendedoraNoRanking[]>;

  /**
   * As pecas que mais sairam. Com `vendedoraId`, so as dela; com `familia`,
   * so as daquele tipo.
   *
   * ORDENADO POR VALOR, e nao por quantidade: numa joalheria a peca que sai
   * dez vezes costuma ser a mais barata da vitrine, e "o que mais vendeu" no
   * sentido que interessa a gestao e o que mais FATUROU.
   */
  itensMaisVendidos(
    janela: JanelaDeVendas,
    limite: number,
    vendedoraId?: string | null,
    familia?: string | null,
  ): Promise<ItemMaisVendido[]>;

  /**
   * QUEM MAIS VENDEU UM TIPO DE PECA — 28/09/2026.
   *
   * ========================================================================
   * E O RANKING QUE FALTAVA, E ELE NAO SAI DOS OUTROS DOIS.
   *
   * Pergunta do Lucas: "qual a vendedora que mais vende brinco?". O
   * `rankingDeVendedoras` soma TUDO que cada uma vendeu, sem separar tipo; o
   * `itensMaisVendidos` separa por peca mas agrupa por PRODUTO, e nao por
   * quem vendeu. Cruzar os dois exigiria uma consulta por vendedora, e a
   * agente respondia "nao da para cruzar" — que era verdade.
   *
   * ORDENADO POR QUANTIDADE, e aqui isto DIVERGE do resto de proposito. Nos
   * outros rankings a ordem e por valor, porque "o que mais vendeu" para a
   * gestao quer dizer o que mais faturou. Aqui a pergunta e "quem mais VENDE
   * brinco", e a resposta esperada e "a Aline, 23 brincos". O valor vai junto
   * na linha, para quem quiser os dois.
   * ========================================================================
   */
  rankingPorFamilia(
    janela: JanelaDeVendas,
    familia: string,
    limite: number,
  ): Promise<VendedoraPorFamilia[]>;

  /**
   * O MESMO MES, EM TODOS OS ANOS — 28/09/2026.
   *
   * ========================================================================
   * NAO SAI DE UMA JANELA `de`/`ate`, E E POR ISSO QUE EXISTE.
   *
   * "Qual vendedora mais vende brinco em outubro?" nao pergunta por um
   * outubro: pergunta pelos outubros. Todo o resto deste arquivo trabalha com
   * uma janela CONTINUA — um inicio e um fim —, e outubro de 2023 mais
   * outubro de 2025 nao e um intervalo, e sim um `extract(month) = 10`
   * atravessando os anos.
   *
   * Responder isso com a janela livre exigiria uma chamada por ano, e antes
   * saber quais anos tem dado — que e outra consulta ainda.
   *
   * QUEBRADO POR ANO, e nao somado: a resposta que o Lucas descreveu e "em
   * outubro de 2025 foi essa, em 2024 foi essa". Um total dos tres outubros
   * esconderia justamente a virada, que e o que a pergunta procura.
   * ========================================================================
   *
   * @param mes 1 a 12.
   * @param porAno quantas vendedoras por ano. 1 devolve so a campea de cada.
   */
  /**
   * O MESMO RECORTE, ANO A ANO — 29/09/2026.
   *
   * ========================================================================
   * DOIS TOTAIS POR ANO, E NAO UM.
   *
   * `receita` e o recorte ATE O DIA do corte; `receitaFechada` e o recorte
   * inteiro. Quando o mes ainda corre, os dois diferem nos anos passados e sao
   * iguais no ano corrente — e e essa diferenca que permite a resposta dizer
   * "ate o dia 29 estamos 12% abaixo" E "setembro passado fechou em R$ 2,1 mi"
   * sem duas consultas.
   *
   * `dia` nulo significa "sem corte": os dois totais voltam iguais.
   * ========================================================================
   */
  compararMesNosAnos(
    mes: number,
    dia: number | null,
    vendedoraId: string | null,
  ): Promise<ComparacaoAnual[]>;

  /** O mesmo (mes, dia) inicial e final, em cada ano. */
  compararPeriodoNosAnos(
    inicio: { mes: number; dia: number },
    fim: { mes: number; dia: number },
    vendedoraId: string | null,
  ): Promise<ComparacaoAnual[]>;

  rankingPorFamiliaNoMes(
    mes: number,
    familia: string,
    porAno: number,
  ): Promise<VendedoraPorFamiliaNoAno[]>;
}

export const VENDAS_MOVIMENTACAO_REPOSITORY = Symbol(
  'IVendasMovimentacaoRepository',
);
