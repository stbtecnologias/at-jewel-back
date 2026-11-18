import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * NENHUMA CONSULTA FILTRA `saida`/`entrada` NA MÃO — 18/11/2026.
 *
 * ==========================================================================
 * ERAM 47 PONTOS, E O 48º SERÁ ESCRITO POR QUEM NÃO LEU NADA DISTO.
 *
 * `movimentacao-como-venda.ts` existe desde 01/10/2026 para a regra da venda
 * morar num lugar só — e mesmo assim 47 consultas filtravam `m.saida` e
 * `m.entrada` diretamente, sem passar por ele. Foi por isso que a correção da
 * consignação, em 18/11, teve de tocar quatro arquivos em vez de um: o helper
 * sozinho não alcançava a maioria.
 *
 * Este teste não prova comportamento. Ele impede a reincidência — e é o único
 * jeito, porque um filtro cru novo não quebra teste nenhum: ele simplesmente
 * volta a contar consignação como venda, em silêncio, num número que ninguém
 * reconcilia.
 *
 * QUEM PRECISAR DE UM FILTRO NOVO usa `ehVenda`, `ehDevolucao` ou
 * `ehConsignacao`. Quem tiver um caso que nenhum dos três cobre deve
 * acrescentar o quarto conceito ao fragmento — e não escrever a bandeira à
 * mão aqui.
 * ==========================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');

/** Os arquivos que o `vendaEfetiva` sempre quis cobrir. */
const VIGIADOS = [
  'modules/movimentacoes/infrastructure/database/typeorm/repositories/vendas-movimentacao.repository.ts',
  'modules/vendas/infrastructure/database/typeorm/repositories/vendas-de-movimentacao.repository.ts',
  'modules/vendas/infrastructure/database/typeorm/repositories/venda.repository.ts',
  'modules/clientes/infrastructure/database/typeorm/repositories/cliente.repository.ts',
  'modules/analytics/infrastructure/database/typeorm/repositories/analytics-de-movimentacao.repository.ts',
  'modules/atendimentos/infrastructure/database/typeorm/repositories/atendimento.repository.ts',
  'modules/agentes/infrastructure/database/typeorm/repositories/agentes-data.repository.ts',
  'modules/metas/infrastructure/database/typeorm/repositories/meta.repository.ts',
];

/** `m.saida`, `mm.entrada`, `f.saida` — alias curto e ponto. */
const BANDEIRA_CRUA = /\b[a-z]{1,3}\.(saida|entrada)\b/;

/** Linha de comentário: ela pode CITAR a bandeira, e deve poder. */
const COMENTARIO = /^\s*(\/\/|\*|\/\*)/;

/** A linha já passa por um dos conceitos — é o certo. */
const PELO_CONCEITO = /ehVenda|ehDevolucao|ehConsignacao|vendaEfetiva|devolucaoEfetiva/;

/**
 * A SAÍDA EXPLÍCITA, para o caso que não é filtro.
 *
 * Uma CTE precisa PROJETAR `saida` e `entrada` para que o filtro de fora
 * possa usá-las — citar a coluna ali não decide nada. O marcador existe para
 * esse caso e exige o motivo escrito ao lado:
 *
 *   SELECT m.id, m.valor, m.saida, m.entrada  -- bandeira-crua-ok: projecao
 *
 * É deliberadamente chato de escrever. Quem o usar para calar um filtro de
 * verdade está contando consignação como venda de novo, e deixou assinado.
 */
const LIBERADA = /bandeira-crua-ok:\s*\S/;

function crusEm(relativo: string): string[] {
  const fonte = readFileSync(join(RAIZ, relativo), 'utf8');
  return fonte
    .split('\n')
    .map((linha, i) => ({ n: i + 1, linha }))
    .filter(({ linha }) => BANDEIRA_CRUA.test(linha))
    .filter(({ linha }) => !COMENTARIO.test(linha))
    .filter(({ linha }) => !PELO_CONCEITO.test(linha))
    .filter(({ linha }) => !LIBERADA.test(linha))
    .map(({ n, linha }) => `  linha ${n}: ${linha.trim()}`);
}

describe('a bandeira de saida/entrada nao se escreve a mao', () => {
  it.each(VIGIADOS)('%s', (relativo) => {
    expect(crusEm(relativo)).toEqual([]);
  });

  /**
   * A VARREDURA TEM DE SABER ACHAR, e um teste que nunca acha nada não prova
   * que está olhando. Este prova o contrário: diante de uma linha crua, a
   * regra a pega.
   */
  it('a propria varredura reconhece um filtro cru', () => {
    const exemplo = '      count(*) FILTER (WHERE m.saida) AS quantidade,';

    expect(BANDEIRA_CRUA.test(exemplo)).toBe(true);
    expect(COMENTARIO.test(exemplo)).toBe(false);
    expect(PELO_CONCEITO.test(exemplo)).toBe(false);
  });

  it('e deixa passar comentario e uso pelo conceito', () => {
    expect(COMENTARIO.test('      // as consultas sempre filtraram `m.saida`;')).toBe(true);
    expect(PELO_CONCEITO.test('      WHERE ${ehVenda("m")}')).toBe(true);
  });

  it('a saida explicita exige motivo escrito', () => {
    expect(LIBERADA.test('SELECT m.saida -- bandeira-crua-ok: projecao')).toBe(true);
    // Marcador vazio nao libera: quem usa tem de dizer por que.
    expect(LIBERADA.test('SELECT m.saida -- bandeira-crua-ok:')).toBe(false);
  });
});
