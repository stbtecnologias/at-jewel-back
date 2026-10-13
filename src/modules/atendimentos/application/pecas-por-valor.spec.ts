import {
  janelaDaFaixa,
  linhaDaPecaNaFaixa,
  recorteEmPalavras,
} from './pecas-por-valor';

/**
 * ============================================================================
 * AS PEÇAS NUMA FAIXA DE VALOR — 13/10/2026.
 *
 *   — "Quantas peças acima de 100 mil foram vendidas em 2025?"
 *   — "Essa eu não consigo puxar — não tenho como filtrar as vendas por valor
 *      nem varrer o ano inteiro venda a venda."
 *
 * A resposta estava CERTA: o filtro de preço só existia no catálogo, que é o
 * estoque de hoje. No histórico havia total, ranking e vendas por cliente ou
 * vendedora, e faixa de valor nenhuma.
 *
 * O que este arquivo protege é o contorno da consulta — o período, o recorte
 * em palavras e a linha. O número em si se prova contra a base, no
 * `conferir-pecas-por-valor.ts`.
 * ============================================================================
 */
describe('o período da faixa', () => {
  const agora = new Date('2026-10-13T15:00:00');

  it('sem datas, é o ANO CORRENTE inteiro', () => {
    const j = janelaDaFaixa(undefined, undefined, agora);

    expect(j.de.getFullYear()).toBe(2026);
    expect(j.de.getMonth()).toBe(0);
    expect(j.de.getDate()).toBe(1);
    expect(j.ate.getMonth()).toBe(11);
    expect(j.ate.getDate()).toBe(31);
  });

  it('com datas, usa as datas — e o fim é o DIA INTEIRO', () => {
    // "até 31/03" sem isto perderia o dia 31 — um trimestre fechado
    // perderia o último dia todo trimestre.
    const j = janelaDaFaixa('2025-01-01', '2025-03-31', agora);

    expect(j.de.getFullYear()).toBe(2025);
    expect(j.ate.getMonth()).toBe(2);
    expect(j.ate.getDate()).toBe(31);
    expect(j.ate.getHours()).toBe(23);
    expect(j.ate.getMinutes()).toBe(59);
  });

  it('data torta NÃO vira janela torta — cai no ano corrente', () => {
    // O `datasDeRecorte` recusa, e cair no atalho devolve um período errado
    // mas EXPLICADO: a agente diz qual recorte usou. Aceitar a data torta
    // devolveria um período errado e mudo.
    for (const [de, ate] of [
      ['2025-02-31', '2025-03-31'],
      ['2025-03-31', '2025-01-01'],
      ['março', 'abril'],
      ['2025-01-01', undefined],
    ] as const) {
      const j = janelaDaFaixa(de, ate as never, agora);
      expect(j.de.getFullYear()).toBe(2026);
    }
  });
});

describe('o recorte em palavras', () => {
  const janela = {
    de: new Date('2025-01-01T00:00:00'),
    ate: new Date('2025-12-31T23:59:59'),
  };

  /* ESTE É O TESTE: sem o recorte, "59 peças" é um número solto. */
  it('diz a FAIXA e o PERÍODO', () => {
    const r = recorteEmPalavras({ minimo: 100000 }, janela);

    expect(r).toContain('acima de');
    expect(r).toContain('100.000');
    expect(r).toContain('01/01/2025');
    expect(r).toContain('31/12/2025');
  });

  it('as três formas de faixa têm três frases', () => {
    expect(recorteEmPalavras({ minimo: 50000 }, janela)).toContain('acima de');
    expect(recorteEmPalavras({ maximo: 50000 }, janela)).toContain('ate');
    expect(recorteEmPalavras({ minimo: 50000, maximo: 100000 }, janela)).toContain(
      'entre',
    );
  });
});

describe('a linha da peça', () => {
  const peca = {
    codigoErp: 'BR25120',
    descricao: 'BRINCO DTS 8.42 CTS OA 18K',
    valorUnitario: 415520,
    quantidade: 1,
    quando: new Date('2025-02-14T12:00:00'),
    clienteNome: 'Cliente Um',
    vendedoraNome: 'Ylka Franck',
  };

  it('traz a peça, o valor, a data, o cliente e a vendedora', () => {
    const l = linhaDaPecaNaFaixa(peca);

    expect(l).toContain('BRINCO DTS');
    expect(l).toContain('415.520');
    expect(l).toContain('14/02/2025');
    expect(l).toContain('Cliente Um');
    expect(l).toContain('Ylka Franck');
  });

  it('só mostra a quantidade quando passa de uma', () => {
    // Quase toda peça cara sai uma a uma; "x1" em toda linha seria ruído.
    expect(linhaDaPecaNaFaixa(peca)).not.toContain('x1');
    expect(linhaDaPecaNaFaixa({ ...peca, quantidade: 3 })).toContain('x3');
  });

  it('sem descrição, cai no código — e nunca fica sem nome', () => {
    const l = linhaDaPecaNaFaixa({ ...peca, descricao: null });

    expect(l).toContain('BR25120');
  });
});
