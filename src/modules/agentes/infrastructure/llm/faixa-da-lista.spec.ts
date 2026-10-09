import { faixaDaLista } from './anthropic.client';

/**
 * ==========================================================================
 * A AGENTE DISSE "OS 20 PRIMEIROS" E LISTOU DEZ — produção, 09/10/2026.
 *
 * Primeiro dia dos clientes Ouro no ar. A pergunta foi "quem são os clientes
 * ouro?", a ferramenta devolveu 20 linhas, e a resposta saiu assim:
 *
 *   "São 48 clientes Ouro no total (6 compras ou mais). Aqui vão os 20
 *    primeiros, por número de compras:"
 *    1. ... (dez linhas)
 *   "Faltam 28. Quer que eu continue a lista?"
 *
 * Dez linhas. Para quem leu, faltavam 38, não 28 — e o número veio com a
 * mesma confiança do resto.
 *
 * O NÚMERO ERRADO NÃO É O PIOR. Se ela mostra dez e a gestora diz
 * "continua", a chamada seguinte vai com `a_partir_de = 20` — o valor que
 * este texto mandou usar — e os clientes 11 a 20 somem para sempre, sem
 * nada na conversa indicando que sumiram. Um recorte que esconde e não diz.
 *
 * "Repasse os nomes exatamente como estão" não bastava: o modelo leu como
 * "seja fiel aos que você escolher repetir". O `consultar_produtos` aprendeu
 * isso em 08/10 e ganhou um "LISTE TODAS"; a lição não tinha chegado a esta
 * função, que é por onde QUATRO ferramentas paginam — produtos, carteira,
 * leads e agora fidelidade.
 * ==========================================================================
 */
describe('faixaDaLista — a frase que faz a lista longa andar', () => {
  /* ESTE É O TESTE. */
  it('MANDA LISTAR TODAS, com o número na frase', () => {
    const t = faixaDaLista(0, 20, 48);

    // O número tem de estar na instrução, e não só no "são 48 no total":
    // "liste todas" sem o número deixa o modelo decidir quantas são todas.
    expect(t).toContain('LISTE AS 20 LINHAS ACIMA');
    expect(t).toContain('TODAS');
  });

  it('e DIZ o que acontece se mostrar menos — o dano é o que convence', () => {
    const t = faixaDaLista(0, 20, 48);

    // Sem a consequência, a instrução é só mais uma ordem entre dez. Com
    // ela, o modelo sabe que omitir uma linha a apaga para sempre.
    expect(t).toContain('21o');
    expect(t).toMatch(/nao aparecem\s+nunca mais/);
  });

  it('a faixa e o total continuam lá', () => {
    const t = faixaDaLista(0, 20, 48);

    expect(t).toContain('SAO 48 NO TOTAL');
    expect(t).toContain('do 1o ao 20o');
    expect(t).toContain('FALTAM 28');
    expect(t).toContain('a_partir_de = 20');
  });

  it('na segunda página, o número da instrução é o da página', () => {
    // 21 a 40 de 48: a instrução fala das 20 DESTA página, não das 40.
    const t = faixaDaLista(20, 20, 48);

    expect(t).toContain('LISTE AS 20 LINHAS ACIMA');
    expect(t).toContain('do 21o ao 40o');
    expect(t).toContain('FALTAM 8');
    expect(t).toContain('a_partir_de = 40');
    expect(t).toContain('41o');
  });

  it('página final diz que acabou, e não oferece continuação', () => {
    const t = faixaDaLista(40, 8, 48);

    expect(t).toContain('ESTES SAO OS ULTIMOS');
    expect(t).not.toContain('a_partir_de');
  });

  it('lista que coube inteira não diz nada — não há faixa a anunciar', () => {
    expect(faixaDaLista(0, 10, 10)).toBe('');
    expect(faixaDaLista(0, 3)).toBe('');
  });

  it('o total nunca é menor que o mostrado na frase', () => {
    // Guarda contra um off-by-one no "FALTAM": com 20 de 48 faltam 28, e
    // não 29 nem 27. Foi exatamente esse número que a resposta repetiu.
    for (const [pulados, mostrados, total] of [
      [0, 20, 48],
      [20, 20, 48],
      [0, 1, 2],
      [15, 15, 97],
    ] as const) {
      const t = faixaDaLista(pulados, mostrados, total);
      expect(t).toContain(`FALTAM ${total - pulados - mostrados}`);
    }
  });
});
