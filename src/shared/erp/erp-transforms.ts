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

/**
 * O UUID OPCIONAL QUE PODE VIR VAZIO — 17/11/2026.
 *
 * ==========================================================================
 * NASCEU DE 16 MOVIMENTACOES RECUSADAS POR DUAS ASPAS.
 *
 * O integrador manda `"idVendedora": ""` para a venda sem vendedora, e a
 * resposta era `400 idVendedora must be a UUID`. O motivo e uma linha do
 * class-validator: o `@IsOptional()` pula as outras validacoes quando o valor
 * e `null` ou `undefined`, E SO NESSES DOIS CASOS. Campo ausente passa, `null`
 * passa, `""` vira valor e o `@IsUUID()` recusa.
 *
 * Para um humano, "nao mandei", "mandei nulo" e "mandei vazio" dizem a mesma
 * coisa. Para a biblioteca, os dois primeiros sao ausencia e o terceiro e um
 * valor sem forma de UUID.
 *
 * SO TEXTO VAZIO VIRA AUSENCIA, e isso e deliberado. Em 16/11 eu havia
 * proposto incluir `0` e `"0"`; mudei em 17/11, medindo: ha prova de que o ERP
 * manda `""` e nenhuma de que mande `0`. Zero nao e vazio, e um valor — se
 * aceitarmos como "nenhuma" e significar outra coisa, a movimentacao entra
 * errada e CALADA. Recusando, o 400 conta, que e como este defeito apareceu.
 *
 * E um codigo do ERP no campo do nosso uuid — `"000000009599"` — continua
 * recusado de proposito: ali e erro de mapeamento, nao ausencia.
 * ==========================================================================
 */
export function uuidOuAusente(valor: unknown): unknown {
  if (typeof valor === 'string' && valor.trim() === '') return undefined;
  return valor;
}
