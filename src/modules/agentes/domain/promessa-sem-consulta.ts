/**
 * A PROMESSA QUE ENCERRA O TURNO — 26/10/2026.
 *
 * ==========================================================================
 * ACONTECEU EM PRODUÇÃO, E ELE TEVE DE PERGUNTAR "CADÊ?" DUAS VEZES.
 *
 *   — "quais as vendas de SP?"
 *   — "Você quer o faturamento da filial ou as vendas uma a uma?"
 *   — "desse ano"
 *   — "Vou olhar o faturamento por empresa deste ano."   (e parou)
 *   — "cade?"
 *   — "A filial de SP faturou R$ 925.955 em 6 vendas…"
 *
 * O modelo escreveu que ia consultar, **não chamou ferramenta nenhuma** e
 * encerrou o turno. O texto é uma resposta perfeitamente formada do ponto de
 * vista do código — tem texto, tem `end_turn` —, e é a pior espécie de falha:
 * quem leu fica esperando o que foi prometido.
 * ==========================================================================
 *
 * É A IRMÃ DA SEGUNDA CHANCE DE 21/10, virada para o outro lado: lá o turno
 * não escreveu nada; aqui ele escreveu que ia fazer, e não fez.
 *
 * A REGRA É ESTREITA DE PROPÓSITO. Toda frase que isto marcar por engano custa
 * uma ida a mais ao modelo e uma resposta que demora — então é melhor deixar
 * passar uma promessa do que cobrar uma resposta de verdade.
 */

/** "Vou olhar…", "deixa eu buscar…", "já vou conferir…". */
const PROMESSA =
  /^(vou|já vou|ja vou|agora vou|deixa eu|deixe-me|vamos|irei)\b[^.!?]{0,80}\b(olhar|buscar|ver|puxar|consultar|conferir|verificar|trazer|checar|levantar|procurar)/i;

/** Acima disto a resposta já tem o dado dentro, e não é promessa de nada. */
const TETO_DA_PROMESSA = 160;

export function ehPromessaSemDado(texto: string): boolean {
  const limpo = texto.trim();
  if (!limpo || limpo.length > TETO_DA_PROMESSA) return false;

  // PERGUNTA NÃO É PROMESSA. "De qual vendedora?" é resposta legítima, e é
  // assim que ela desfaz ambiguidade — cobrar dado aqui atropelaria a única
  // coisa certa a fazer.
  if (limpo.includes('?')) return false;

  // DOIS-PONTOS NO FIM: a abertura da lista chegou e a lista não. Em 26/10
  // isso era o primeiro bloco de texto saindo sozinho, mas a frase também
  // aparece quando o modelo simplesmente para — e nos dois casos quem lê
  // ficou sem o que foi anunciado.
  return PROMESSA.test(limpo) || limpo.endsWith(':');
}

/**
 * O QUE SE DIZ AO MODELO quando ele prometeu e não fez.
 *
 * Diz o que FAZER, e não que ele errou: "você disse que ia e não foi" sem o
 * imperativo seguinte costuma render um pedido de desculpas no lugar do dado.
 */
export const COBRANCA_DA_PROMESSA =
  'Você anunciou a consulta e nao a fez: nenhuma ferramenta foi chamada. ' +
  'CONSULTE AGORA, com a ferramenta certa, e responda com o dado na mesma ' +
  'mensagem. Nao repita o anuncio, e nao peca desculpa.';
