/**
 * Normaliza um numero de telefone removendo tudo que nao for digito.
 * Ex: "(85) 9 8888-7777" -> "85988887777"
 *     "+55 85 98888-7777" -> "5585988887777"
 *
 * Usado antes de aplicar `hashField` para garantir que formatos diferentes
 * do mesmo numero produzam o mesmo hash.
 */
export function normalizarTelefone(valor: string): string {
  return valor.replace(/\D/g, '');
}
