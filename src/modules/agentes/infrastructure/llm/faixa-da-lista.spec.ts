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
 *
 * E DESDE 27/10/2026 A PAGINAÇÃO É DECLARADA, não presumida: `paginavel`
 * entra em quem tem `a_partir_de` no schema. O porquê está no outro
 * `describe`, embaixo.
 */
describe('faixaDaLista — a frase que faz a lista longa andar', () => {
  const PAGINA = { paginavel: true };

  /* ESTE É O TESTE. */
  it('MANDA LISTAR TODAS, com o número na frase', () => {
    const t = faixaDaLista(0, 20, 48, PAGINA);

    // O número tem de estar na instrução, e não só no "são 48 no total":
    // "liste todas" sem o número deixa o modelo decidir quantas são todas.
    expect(t).toContain('LISTE AS 20 LINHAS ACIMA');
    expect(t).toContain('TODAS');
  });

  it('e DIZ o que acontece se mostrar menos — o dano é o que convence', () => {
    const t = faixaDaLista(0, 20, 48, PAGINA);

    // Sem a consequência, a instrução é só mais uma ordem entre dez. Com
    // ela, o modelo sabe que omitir uma linha a apaga para sempre.
    expect(t).toContain('21o');
    expect(t).toMatch(/nao aparecem\s+nunca mais/);
  });

  it('a faixa e o total continuam lá', () => {
    const t = faixaDaLista(0, 20, 48, PAGINA);

    expect(t).toContain('SAO 48 NO TOTAL');
    expect(t).toContain('do 1o ao 20o');
    expect(t).toContain('FALTAM 28');
    expect(t).toContain('a_partir_de = 20');
  });

  it('na segunda página, o número da instrução é o da página', () => {
    // 21 a 40 de 48: a instrução fala das 20 DESTA página, não das 40.
    const t = faixaDaLista(20, 20, 48, PAGINA);

    expect(t).toContain('LISTE AS 20 LINHAS ACIMA');
    expect(t).toContain('do 21o ao 40o');
    expect(t).toContain('FALTAM 8');
    expect(t).toContain('a_partir_de = 40');
    expect(t).toContain('41o');
  });

  it('página final diz que acabou, e não oferece continuação', () => {
    const t = faixaDaLista(40, 8, 48, PAGINA);

    expect(t).toContain('ESTES SAO OS ULTIMOS');
    expect(t).not.toContain('a_partir_de');
  });

  it('lista que coube inteira não diz nada — não há faixa a anunciar', () => {
    expect(faixaDaLista(0, 10, 10, PAGINA)).toBe('');
    expect(faixaDaLista(0, 3, undefined, PAGINA)).toBe('');
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
      const t = faixaDaLista(pulados, mostrados, total, PAGINA);
      expect(t).toContain(`FALTAM ${total - pulados - mostrados}`);
    }
  });
});

/**
 * ==========================================================================
 * "NÃO CONSIGO REUNIR A LISTA INTEIRA DE 2025 AQUI" — produção, 27/10/2026.
 *
 * A gestora pediu as vendas da Ylka em 2025 e 2026. Às 10:13 a agente
 * escreveu, palavra por palavra:
 *
 *   "A ferramenta devolve só 10 por chamada — para montar as 90 de 2025 eu
 *    precisaria paginar, mas ela não tem como pular para os próximos blocos
 *    neste recorte, então não consigo reunir a lista inteira de 2025 aqui."
 *
 * E, duas mensagens depois: "para ter as 90 de 2025 por inteiro, o caminho
 * é o painel."
 *
 * ELA ESTAVA CERTA SOBRE A PAGINAÇÃO E ERRADA SOBRE A SAÍDA, e as duas
 * coisas vinham deste texto:
 *
 *   1. ele mandava oferecer `a_partir_de` — e `vendas_detalhadas` não tem
 *      esse parâmetro. Das oito leituras de gestão que passam por aqui, UMA
 *      tem. Sete ofereciam o que não podiam cumprir;
 *   2. ele nunca falava do ARQUIVO. O PDF leva 500 linhas desde 20/10: as
 *      90 vendas caberiam inteiras. Ninguém disse isso a ela, e ela
 *      inventou o painel.
 *
 * O PADRÃO É O SEGURO: sem `paginavel`, não se oferece página. Leitura nova
 * que esqueça o parâmetro erra para o lado de não prometer.
 * ==========================================================================
 */
describe('faixaDaLista — quem não pagina não oferece página', () => {
  it('por padrão NÃO manda paginar, e proíbe o painel', () => {
    const t = faixaDaLista(0, 10, 90);

    expect(t).toContain('SAO 90 NO TOTAL');
    expect(t).toContain('do 1o ao 10o');
    expect(t).toContain('LISTE AS 10 LINHAS ACIMA');
    // O que a conversa de 27/10 provou que precisa estar escrito:
    expect(t).not.toContain('a_partir_de');
    expect(t).toContain('NAO HA COMO PEDIR AS SEGUINTES');
    expect(t).toContain('NUNCA mande ela ao painel');
  });

  /**
   * ========================================================================
   * A LISTA INTEIRA PASSOU A SAIR SOZINHA — 28/10/2026.
   *
   * Em 27/10 este texto mandava LISTAR as 10 e dizer que faltavam 80. Em
   * 28/10 à tarde passou a oferecer a lista inteira. Agora ela SAI — e por
   * isso o texto não pede mais que ele liste: listar mandaria a mesma lista
   * duas vezes, a nossa completa e a dele parcial.
   *
   * O risco mudou de lado, e o teste mudou com ele: não é mais "ele mostra
   * menos do que diz", é "ele repete o que já está saindo".
   * ========================================================================
   */
  it('com saída, PROÍBE listar — a lista completa já vai sair', () => {
    const t = faixaDaLista(0, 10, 90, { arquivoLevaTudo: true });

    expect(t).toContain('SAO 90 NO TOTAL');
    expect(t).toContain('LISTA COMPLETA com as 90');
    expect(t).toContain('NAO LISTE NENHUMA LINHA');
    expect(t).toContain('RESPONDA EM UMA FRASE');
    // O assunto antigo sai inteiro: não falta nada, e não há página a pedir.
    expect(t).not.toContain('a_partir_de');
    expect(t).not.toContain('FALTAM');
    // E a proibição de 27/10 continua valendo.
    expect(t).toContain('NUNCA mande ela ao painel');
  });

  it('e o arquivo passa a ser OPÇÃO, não o caminho', () => {
    // Até 28/10 o arquivo era o único jeito de ter a lista inteira. Agora a
    // conversa já leva tudo, então o PDF é preferência de quem lê.
    const t = faixaDaLista(0, 10, 90, { arquivoLevaTudo: true });

    expect(t).toContain('Se ela preferir arquivo');
    expect(t).toContain('PDF ou planilha');
  });

  it('quem pagina E tem saída também não lista, nem pagina', () => {
    // A paginação deixou de ser o assunto: com a lista inteira saindo, pedir
    // `a_partir_de` seria pedir de novo o que já foi.
    const t = faixaDaLista(0, 20, 48, {
      paginavel: true,
      arquivoLevaTudo: true,
    });

    expect(t).toContain('LISTA COMPLETA com as 48');
    expect(t).toContain('NAO LISTE NENHUMA LINHA');
    expect(t).not.toContain('a_partir_de');
  });

  it('lista que coube não anuncia arquivo nenhum', () => {
    // Não há o que exportar além do que já está escrito na conversa.
    expect(faixaDaLista(0, 10, 10, { arquivoLevaTudo: true })).toBe('');
  });
});
