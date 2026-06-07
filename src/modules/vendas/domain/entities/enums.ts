export type StatusVenda = 'concluida' | 'cancelada' | 'pendente';

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
