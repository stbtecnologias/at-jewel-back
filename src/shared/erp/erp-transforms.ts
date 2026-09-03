/**
 * Transformacoes de entrada para o que o ERP Safira manda de verdade.
 *
 * Os DTOs do CRM sao escritos em tipos honestos — `string` para identificador,
 * `boolean` para flag. O Safira nao manda nenhum dos dois:
 *
 *   "produtoid": 478146.0        identificador como float
 *   "entrada": 1.0               flag como numero
 *   "saida": 0.0
 *
 * Sem estas transformacoes, o `class-validator` recusaria o payload dele
 * inteiro — e a saida seria pedir ao integrador que reescrevesse o export,
 * trabalho que nao e dele e que atrasaria a integracao por um detalhe de
 * serializacao.
 *
 * Elas moram aqui, e nao dentro de um DTO, porque valem para toda a
 * integracao: movimentacao hoje, estoque e cadastros quando ele mandar.
 */

/**
 * Aceita o identificador como numero ou texto e devolve texto.
 *
 * NAO canonicaliza. Tirar padding e zero a esquerda e trabalho do
 * `normalizarIdErp`, no use case — aqui o unico objetivo e passar pelo
 * `@IsString()` sem alterar o que chegou, para que o valor cru continue
 * disponivel se alguem for depurar o payload.
 */
export function idErpEntrada(valor: unknown): unknown {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    // `9000000324.0` ja chega do JSON.parse como `9000000324`; o
    // `Number.isInteger` cobre o caso e evita "1.5e21" em notacao cientifica.
    return Number.isInteger(valor) ? valor.toFixed(0) : String(valor);
  }
  return valor;
}

/**
 * Aceita a flag como numero (1/0), texto ('1'/'0'/'true'/'false') ou boolean.
 *
 * Devolve o valor original quando nao reconhece, para o `@IsBoolean()` falhar
 * com a mensagem certa em vez de virar `false` em silencio — flag trocada por
 * engano inverte o sentido do documento e troca quem e o cliente.
 */
export function booleanoEntrada(valor: unknown): unknown {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') {
    if (valor === 1) return true;
    if (valor === 0) return false;
    return valor;
  }
  if (typeof valor === 'string') {
    const t = valor.trim().toLowerCase();
    if (t === 'true' || t === '1') return true;
    if (t === 'false' || t === '0') return false;
  }
  return valor;
}
