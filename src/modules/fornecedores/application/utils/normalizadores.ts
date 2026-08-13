/**
 * Remove tudo que nao for digito. Usado em `cpf_cnpj`, `telefone` e `cep`
 * antes de gravar.
 *
 * Decisao registrada no cabecalho da migracao 26: mascara e apresentacao e
 * pertence ao front. Guardar formatado faria "11.222.333/0001-44" e
 * "11222333000144" virarem registros distintos para o banco.
 *
 * Espelha `normalizarTelefone` do modulo de clientes — mesma regra, nome
 * generico porque aqui vale para documento e CEP tambem.
 */
export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** Aplica `somenteDigitos` preservando null/undefined. */
export function normalizarOpcional(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return valor ?? null;
  const limpo = somenteDigitos(valor);
  return limpo === '' ? null : limpo;
}
