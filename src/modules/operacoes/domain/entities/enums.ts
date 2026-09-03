/**
 * Classificacao da operacao do ERP — espelha o ENUM `operacao_classe` da
 * migracao 46.
 *
 * E o vocabulario FECHADO que decide o que o CRM faz com uma movimentacao. O
 * cadastro `Operacoes` do Safira e aberto e muda sem nos avisar; o
 * comportamento precisa de uma lista que o compilador conheca — mesmo padrao
 * de `forma_pagamento` (migracao 09) servindo de classificacao para o cadastro
 * aberto de `formas_pagamento` (migracao 28).
 *
 * CONFIRMADAS pelo dump de 03/09/2026: VENDA (codigo VEN) e DEVOLUCAO_VENDA
 * (codigo DVE). As demais vem do levantamento de 11/08 — §2 (consignacao) e
 * RF-INT-15 (transferencia entre empresas) — e estao aqui por anteciparem o
 * que ja se sabe existir do lado de la.
 *
 * OUTRA e a valvula, e e o default no banco: operacao que chega sem de-para
 * fica classificada como desconhecida em vez de ser adivinhada pelo nome. Ela
 * e gravada fielmente e nao projeta em lugar nenhum ate alguem classificar.
 */
export const OPERACAO_CLASSES = [
  'VENDA',
  'DEVOLUCAO_VENDA',
  'COMPRA',
  'DEVOLUCAO_COMPRA',
  'TRANSFERENCIA',
  'CONSIGNACAO',
  'AJUSTE',
  'OUTRA',
] as const;

export type OperacaoClasse = (typeof OPERACAO_CLASSES)[number];

/**
 * As classificacoes que geram receita ou a estornam — as unicas que a projecao
 * para `vendas` vai olhar quando ela for escrita.
 *
 * Existe aqui, e nao chumbada na projecao, porque a mesma pergunta ("isto
 * conta como venda?") vai ser feita pelo analytics e pela conferencia com o
 * Alessandro. Duas copias divergiriam na primeira operacao nova.
 */
export const CLASSES_DE_RECEITA: readonly OperacaoClasse[] = [
  'VENDA',
  'DEVOLUCAO_VENDA',
];
