/**
 * Normaliza um identificador vindo do ERP Safira para uma forma canonica.
 *
 * ============================================================================
 * POR QUE ISTO EXISTE
 *
 * O Safira manda o MESMO identificador em formas diferentes, e as chaves
 * estrangeiras dele apontam ora para uma, ora para outra. Do dump de
 * 03/09/2026:
 *
 *   Operacoes.id_opee                  9000000324      numero
 *   Operacoes.idErpOperacoes           "009000000324"  zeros a esquerda
 *   Movimentacao.operacaoid            9000000324      <- aponta para o NUMERO
 *
 *   Movimentacao.id_mest               1294138         numero
 *   Movimentacao.iderpmovimentacao     "     1294138"  espacos a esquerda
 *   MovimentacaoProduto.movimentacaoid "     1294138"  <- aponta para o TEXTO
 *
 * Sao o mesmo registro nas duas linhas de cada bloco. Guardando "009000000324"
 * como `operacoes.id_erp`, a movimentacao que chega dizendo `9000000324` nao
 * acha a operacao — e entra sem saber o que e, calada. E a mesma familia de
 * defeito que a migracao 34 documentou para o `codigo_erp` mutavel: a chave
 * deixa de casar e o sistema cria ou perde registro sem reclamar.
 *
 * ============================================================================
 * A REGRA
 *
 *   1. tira espaco das duas pontas
 *   2. tira `.0` de sobra, que e como o JSON serializa numero inteiro
 *   3. se o que sobrou for so digito, tira os zeros a esquerda
 *   4. qualquer outra coisa fica como chegou (ja aparada)
 *
 *   "     1294138"   -> "1294138"
 *   "009000000324"   -> "9000000324"
 *   9000000324       -> "9000000324"
 *   "1294138.0"      -> "1294138"
 *   "VEN"            -> "VEN"        (codigo de negocio nao e numero)
 *   "000"            -> "0"          (nao vira string vazia)
 *
 * ============================================================================
 * POR QUE TIRAR ZERO A ESQUERDA NAO E CHUTE
 *
 * A primeira versao desta funcao preservava os zeros, com o argumento de que
 * so o Alessandro poderia dizer se "009000000324" e "9000000324" sao o mesmo
 * identificador. O proprio dump respondeu: `id_opee` e NUMERICO, entao o zero
 * a esquerda e formatacao de exibicao, nao parte do valor — um id numerico nao
 * tem como distinguir "007" de "7".
 *
 * O QUE ISSO CUSTA, declarado: se um dia ele mandar identificador que PARECE
 * numero mas nao e — um codigo com zero significativo a esquerda —, esta
 * funcao o descaracteriza. Por isso a regra so vale para o que e INTEIRAMENTE
 * digito: "VEN", "AN001" e "0-12" passam intactos.
 */

/** Numero inteiro serializado como float: "1294138.0", "9000000324.00". */
const SUFIXO_FLOAT = /\.0+$/;

/** So digito, do primeiro ao ultimo caractere. */
const SO_DIGITOS = /^\d+$/;

export function normalizarIdErp(
  valor: string | number | null | undefined,
): string | null {
  if (valor === null || valor === undefined) return null;

  // Numero chega do JSON ja sem o `.0` (JSON.parse de `478146.0` da 478146).
  // O `String` aqui cobre o caso de ele mandar como numero mesmo.
  const texto = typeof valor === 'number' ? String(valor) : valor;

  let limpo = texto.trim();
  if (limpo === '') return null;

  limpo = limpo.replace(SUFIXO_FLOAT, '');
  if (limpo === '') return null;

  if (SO_DIGITOS.test(limpo)) {
    // `replace` em vez de `Number`: o id do Safira ja passa de 9 bilhoes, e
    // nada garante que ele fique abaixo de 2^53 para sempre. Texto nao estoura.
    const semZeros = limpo.replace(/^0+/, '');
    return semZeros === '' ? '0' : semZeros;
  }

  return limpo;
}
