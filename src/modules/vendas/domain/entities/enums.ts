/**
 * O status de uma venda.
 *
 * ==========================================================================
 * `devolvida` ENTROU EM 25/09/2026, e `pendente` ficou sem uso.
 *
 * A venda passou a ser lida da MOVIMENTACAO, e la os tres estados que existem
 * de verdade sao outros:
 *
 *   saida, ativa      -> concluida
 *   entrada, ativa    -> devolvida   (a devolucao de venda, 101 documentos)
 *   ativo = false     -> cancelada   (e assim que o ERP cancela: reenvio)
 *
 * Nao ha venda "pendente" numa movimentacao — o documento so existe depois de
 * acontecer. O valor continua no tipo porque a tabela `vendas` ainda o tem no
 * enum do banco, e porque tirar um valor de enum e migracao com risco por
 * nenhum ganho.
 *
 * ESTE TIPO NAO E O ENUM DO BANCO. O read-model devolve texto, entao
 * `devolvida` nao exigiu migracao — ver `VendasDeMovimentacaoRepository`.
 * ==========================================================================
 */
export type StatusVenda = 'concluida' | 'cancelada' | 'pendente' | 'devolvida';

export type FormaPagamento =
  | 'dinheiro'
  | 'pix'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'transferencia'
  | 'crediario'
  | 'cheque'
  | 'outro';

export const STATUS_VENDA: readonly StatusVenda[] = [
  'concluida',
  'cancelada',
  'pendente',
  'devolvida',
] as const;

export const FORMAS_PAGAMENTO: readonly FormaPagamento[] = [
  'dinheiro',
  'pix',
  'cartao_credito',
  'cartao_debito',
  'transferencia',
  'crediario',
  'cheque',
  'outro',
] as const;
