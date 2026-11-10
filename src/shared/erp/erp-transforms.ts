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
 * O campo de texto que PODE NAO VIR — 10/11/2026.
 *
 * ==========================================================================
 * NASCEU DE 75 PRODUTOS RECUSADOS NUM LOTE SO.
 *
 * `categoria` e `familia` eram `@IsNotEmpty()`, e o ERP tem pecas sem
 * classificacao no cadastro dele — BAU, GIFT CARD, FECHO, CORRENTE, RUBELITA,
 * e brincos e colares normais. Todas voltavam com 400 e NAO ENTRAVAM. A base
 * ficava com 100% de preenchimento porque o que faltava era barrado na porta,
 * e nao porque o cadastro estivesse completo.
 *
 * `undefined` e `null` viram STRING VAZIA, e nao `null`, por tres motivos
 * medidos: as colunas sao NOT NULL, os tipos de dominio e de ORM sao `string`,
 * e ha dez pontos que interpolam estes campos direto em texto que vai para a
 * vendedora — onde `${null}` imprime a palavra "null". E a casa ja tratava
 * `''` como "nao informado" antes disto, no analytics:
 *
 *   COALESCE(NULLIF(p.familia, ''), 'Sem familia')
 *
 * O QUE NAO E TEXTO PASSA INTACTO, para o `@IsString()` recusar com a mensagem
 * certa: afrouxar o obrigatorio nao e afrouxar o tipo.
 * ==========================================================================
 */
export function textoOuVazio(valor: unknown): unknown {
  return valor === undefined || valor === null ? '' : valor;
}

/**
 * O MESMO CAMPO, NA PORTA DE ATUALIZACAO — 10/11/2026, a tarde.
 *
 * ==========================================================================
 * PARECE O `textoOuVazio`, E A DIFERENCA E DE PROPOSITO.
 *
 * Aqui `undefined` PASSA INTACTO. Na criacao, ausente e vazio sao a mesma
 * coisa — a peca nasce sem classificacao. Na atualizacao nao sao: o use case
 * preserva por ausencia —
 *
 *   categoria: input.categoria !== undefined ? input.categoria
 *                                            : existente.categoria
 *
 * — entao transformar `undefined` em `''` faria qualquer PATCH parcial apagar
 * a classificacao da peca. Ausente quer dizer "nao mexe"; `null` e `''`
 * querem dizer "nao tenho".
 *
 * Nao servisse esta funcao, serviria o `textoOuVazio` por acidente, porque
 * `@Transform` nao roda para chave ausente do JSON. Depender desse detalhe
 * para nao perder dado e apostar numa particularidade da biblioteca. Esta
 * funcao diz a intencao, e fica certa mesmo se aquele detalhe mudar.
 * ==========================================================================
 */
export function vazioSeNulo(valor: unknown): unknown {
  return valor === null ? '' : valor;
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
