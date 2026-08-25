/**
 * Neutraliza os curingas do LIKE/ILIKE num termo digitado por gente.
 *
 * Sem isto, um "%" digitado por quem busca deixa de ser um "%" e vira "traga
 * todo mundo"; um "_" casa com qualquer caractere. Nao e injecao de SQL — o
 * valor continua indo por parametro — e sim o filtro deixando de filtrar.
 *
 * Vive aqui porque a mesma regra e usada na busca de clientes e na auditoria
 * de atendimentos, e uma copia em cada lugar divergiria com o tempo.
 */
export function escaparCuringas(termo: string): string {
  return termo.replace(/[\\%_]/g, (c) => '\\' + c);
}
