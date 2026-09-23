/**
 * O SALDO DE UMA PEÇA, escrito uma vez só — 17/09/2026.
 *
 * ==========================================================================
 * `produtos.estoque_atual` (migração 16) NÃO É MAIS LIDA NEM ESCRITA.
 *
 * A coluna nunca teve escritor: o evento de produto do ERP não traz estoque,
 * e em produção ela estava em 0 nos 7.115 produtos. A migração 32 já dizia
 * "a recomendação é aposentá-la". O saldo de verdade chegou em 15/09 pela API
 * do integrador, na tabela `estoque` — 7.034 linhas, 865 peças —, e nada do
 * sistema a lia: Produtos, Analytics, a consulta pelo WhatsApp e os agentes
 * diziam zero para tudo.
 *
 * Decisão do Lucas: tudo passa a ler a tabela `estoque`. A coluna continua no
 * banco (sem migração), sem ninguém olhar para ela.
 * ==========================================================================
 *
 * SALDO = SOMA DAS LINHAS DA PEÇA. Uma peça tem uma linha por empresa × grupo
 * × local (`uq_estoque_chave`); 111 peças têm linha em mais de uma empresa
 * (3 com saldo nas duas). Desde a migração 57 toda linha é de um local nosso,
 * então somar é somar o que está na casa.
 *
 * PEÇA SEM LINHA NENHUMA TEM SALDO ZERO — são 194. Por isso o uso é sempre
 * `LEFT JOIN` + `COALESCE`, nunca `JOIN`: o `JOIN` sumiria com a peça.
 *
 * AGRUPADO UMA VEZ, e não uma subconsulta por peça: não há índice só por
 * `produto_id` (a chave única começa por empresa), e uma subconsulta
 * correlacionada varreria a tabela de estoque para cada uma das 7 mil peças.
 *
 * Uso:
 *   FROM produtos p
 *   LEFT JOIN ${SALDO_POR_PRODUTO} sal ON sal.produto_id = p.id
 *   ... ${saldoDe('sal')} ...
 */
export const SALDO_POR_PRODUTO = `(
  SELECT produto_id, SUM(quantidade)::int AS saldo
    FROM estoque
   GROUP BY produto_id
)`;

/** O saldo já com o zero da peça sem linha. `alias` é o do `LEFT JOIN`. */
export function saldoDe(alias: string): string {
  return `COALESCE(${alias}.saldo, 0)`;
}
