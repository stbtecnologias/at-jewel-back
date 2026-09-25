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
   * As pecas que mais sairam. Com `vendedoraId`, so as dela.
   *
   * ORDENADO POR VALOR, e nao por quantidade: numa joalheria a peca que sai
   * dez vezes costuma ser a mais barata da vitrine, e "o que mais vendeu" no
   * sentido que interessa a gestao e o que mais FATUROU.
   */
  itensMaisVendidos(
    janela: JanelaDeVendas,
    limite: number,
    vendedoraId?: string | null,
  ): Promise<ItemMaisVendido[]>;
}

export const VENDAS_MOVIMENTACAO_REPOSITORY = Symbol(
  'IVendasMovimentacaoRepository',
);
