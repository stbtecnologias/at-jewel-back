/**
 * AS CATEGORIAS DO CATÁLOGO, E O PADRÃO DE QUEM PERGUNTA — 07/10/2026.
 *
 * ==========================================================================
 * "O SISTEMA MISTURA JOIA E ITEM DE DECORAÇÃO" — reunião de 06/10.
 *
 * O campo `categoria` sempre existiu e sempre separou. O que faltava era a
 * agente usá-lo. Medido na base em 07/10, e o número explica o incômodo:
 * das 546 peças com saldo, **210 são HOME** — 38% de tudo que dá para
 * vender é decoração.
 *
 * E ao vivo, no mesmo dia: perguntaram pelas esmeraldas com saldo e vieram
 * cilindro, vaso, copo, bowl e cinzeiro. As nove esmeraldas disponíveis são
 * duas joias e sete peças de casa.
 *
 * Decisão do Lucas: **o padrão é joia**; se ela pedir outra coisa, a agente
 * traz.
 * ==========================================================================
 */

/** O que existe de verdade na coluna `categoria` — medido em 07/10/2026. */
export const CATEGORIAS = [
  'JEWEL',
  'HOME',
  'GOLDESIGN',
  'AT WEAR',
  'COLLAB',
  'COLLAB VR',
  'AP',
  'CONSERTO',
  'WISH',
  'GOLDHOME',
  'ARIEL',
] as const;

/** Joia. O que a loja é, e o que a pergunta sem recorte quer dizer. */
export const CATEGORIA_PADRAO = 'JEWEL';

/** O valor que desliga o recorte — "me mostra tudo". */
export const TODAS_AS_CATEGORIAS = 'TODAS';

/**
 * A categoria que a consulta deve usar.
 *
 * - vazio      -> JEWEL, o padrão;
 * - TODAS      -> `undefined`, sem recorte nenhum;
 * - conhecida  -> ela mesma;
 * - inventada  -> JEWEL.
 *
 * O ÚLTIMO CASO É DE PROPÓSITO. O modelo às vezes escreve "JOIAS", "Joia" ou
 * "ANEL" aqui; cair no padrão é melhor do que filtrar por um valor que não
 * existe e devolver zero — e o texto do despacho DIZ em que categoria a lista
 * está, então o engano não fica escondido.
 */
export function categoriaDaBusca(pedida?: string): string | undefined {
  const limpa = (pedida ?? '').trim().toUpperCase();
  if (!limpa) return CATEGORIA_PADRAO;
  if (limpa === TODAS_AS_CATEGORIAS) return undefined;
  return (CATEGORIAS as readonly string[]).includes(limpa)
    ? limpa
    : CATEGORIA_PADRAO;
}

/** Como a categoria aparece na frase da agente. */
export function categoriaEmPalavras(categoria: string): string {
  return categoria === 'JEWEL' ? 'JOIA' : categoria;
}
