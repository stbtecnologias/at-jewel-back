/**
 * Normalizacao de filtro de query que aceita MAIS DE UM valor.
 *
 * Criado em 10/09/2026, quando os filtros da tela de Vendas passaram a aceitar
 * selecao multipla (pedido do Yerlon na revisao de homologacao).
 */

/**
 * Devolve sempre uma lista, a partir das tres formas que o mesmo filtro chega:
 *
 *   ?status=concluida                  -> 'concluida'            (string)
 *   ?status=concluida&status=pendente  -> ['concluida', ...]     (array)
 *   ?status=concluida,pendente         -> 'concluida,pendente'   (string)
 *
 * As tres precisam valer. A segunda e a que o `URLSearchParams` do navegador
 * produz naturalmente; a terceira e mais curta e e a que um integrador tende a
 * escrever a mao. E a PRIMEIRA precisa continuar funcionando: e o contrato que
 * ja esta publicado, e quebra-lo seria trocar um filtro por um erro 400.
 *
 * NAO valida o conteudo. Valor irreconhecivel passa adiante inteiro, para o
 * `@IsIn(..., { each: true })` recusar com a mensagem util em vez de este
 * helper engolir em silencio.
 *
 * Vazio vira `undefined` e nao `[]`: com `@IsOptional`, `undefined` significa
 * "sem filtro" e a condicao nem entra na query. Uma lista vazia significaria
 * "nenhum valor serve", que devolveria zero linhas — o oposto do esperado por
 * quem apenas limpou o campo.
 */
export function listaEntrada(valor: unknown): unknown {
  if (valor === undefined || valor === null || valor === '') return undefined;

  const bruto = Array.isArray(valor) ? valor : [valor];
  const itens: unknown[] = [];

  for (const v of bruto) {
    if (typeof v === 'string') {
      for (const parte of v.split(',')) {
        const t = parte.trim();
        if (t !== '') itens.push(t);
      }
    } else {
      itens.push(v);
    }
  }

  if (itens.length === 0) return undefined;
  // Repetido nao muda o resultado de um IN, mas suja o log e o parametro.
  return [...new Set(itens)];
}
