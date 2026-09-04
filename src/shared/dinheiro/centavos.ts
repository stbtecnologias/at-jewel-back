/**
 * Soma de dinheiro sem o ruido do ponto flutuante.
 *
 * ============================================================================
 * POR QUE ISTO EXISTE
 *
 * Apareceu em producao, em 04/09/2026, na movimentacao 1354219 do Alessandro:
 *
 *   51566.66 + 78926.67 + 100000  ->  230493.33000000002
 *
 * As tres parcelas estao exatas no banco (`DECIMAL(15,2)`); o ruido nasce na
 * soma em JavaScript, onde 0.1 + 0.2 nao da 0.3. O campo era so derivado, mas
 * o estrago nao seria so estetico:
 *
 *   `totalDosItens` e `valor` existem PARA SEREM COMPARADOS — e a conferencia
 *   "o que chegou bate com o que saiu do ERP". Uma comparacao de igualdade
 *   sobre float com ruido da falso, e a projecao que ainda vai ser escrita vai
 *   querer fazer exatamente essa comparacao.
 *
 * ============================================================================
 * A REGRA
 *
 * Soma-se em CENTAVOS, que sao inteiros, e volta-se para reais no fim. Um
 * arredondamento por parcela, nenhum acumulado.
 *
 * `venda.entity.ts` ja fazia isso desde a migracao 09, com um `paraCentavos`
 * privado — e e de la que a ideia vem. Aquele nao foi movido para ca junto:
 * mexer na entidade de vendas para deduplicar uma funcao de uma linha, com
 * 641 testes em volta, e risco sem retorno no meio de uma integracao. Fica
 * anotado como divida.
 */

/**
 * Reais para centavos. `Math.round` porque o proprio valor de entrada pode
 * chegar com ruido — `2467.5000000000005` tem de virar `246750`.
 */
export function paraCentavos(valor: number): number {
  return Math.round(valor * 100);
}

/**
 * Soma valores em reais pelo caminho dos centavos.
 *
 * Lista vazia da `0`, e nao `NaN` — documento sem item e sem pagamento e
 * estado valido nesta integracao (oito dos 24 do dump nao tem pagamento).
 */
export function somarEmReais(valores: readonly number[]): number {
  const centavos = valores.reduce((acc, v) => acc + paraCentavos(v), 0);
  return centavos / 100;
}
