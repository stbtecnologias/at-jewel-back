import {
  aplicarNoPlano,
  conferir,
  resumoDoPdf,
  traduzir,
  type ContextoDoAjuste,
} from './ajustes-do-catalogo';
import { paginasDoPdf, type PlanoDaMontagem } from './plano-da-montagem';

/**
 * O AJUSTE PÁGINA POR PÁGINA — 16/09/2026.
 *
 * O catálogo de teste, como sai no PDF:
 *
 *   1 capa
 *   2 modelo usando AN1 (anel esmeralda)
 *   3 joias: CO1 (colar turquesa), BR1 (brinco rubi)
 *   4 contracapa
 */
const PLANO = (): PlanoDaMontagem => ({
  versao: 1,
  formato: '9:16',
  direcao: {
    cena: 'praia',
    modelo: 'uma mulher elegante',
    paleta: { fundo: '#ffffff', destaque: '#b8912f', texto: '#1a1a1a' },
    frase: 'Dias de sol',
  },
  paginas: [
    { tipo: 'capa' },
    { tipo: 'modelo', fotoId: 'an1' },
    { tipo: 'grade', fotoIds: ['co1', 'br1'] },
    { tipo: 'contracapa' },
  ],
  arquivos: {
    capa: 'x.capa.jpg',
    fundo: 'x.fundo.jpg',
    'modelo:an1': 'x.modelo-an1.jpg',
  },
});

const contexto = (plano = PLANO()): ContextoDoAjuste => {
  const pecas = new Map([
    ['an1', { codigo: 'AN1', descricao: 'ANEL ESMERALDA' }],
    ['co1', { codigo: 'CO1', descricao: 'COLAR TURQUESA' }],
    ['br1', { codigo: 'BR1', descricao: 'BRINCO RUBI' }],
  ]);
  return {
    paginas: paginasDoPdf(
      plano,
      (id) => pecas.has(id),
      (n) => n in plano.arquivos,
    ),
    temTema: plano.direcao !== null,
    pecas,
  };
};

describe('resumoDoPdf — o que a IA lê', () => {
  it('numera as páginas como no PDF e cita código e descrição, sem preço', () => {
    const r = resumoDoPdf(contexto(), {
      nome: 'Holiday',
      tema: 'Férias',
      frase: 'Dias de sol',
    });

    expect(r).toContain('Página 1 — CAPA. Título: "Holiday"');
    expect(r).toContain('Página 2 — MODELO usando AN1 (ANEL ESMERALDA)');
    expect(r).toContain(
      'Página 3 — JOIAS: CO1 (COLAR TURQUESA); BR1 (BRINCO RUBI)',
    );
    expect(r).toContain('Página 4 — CONTRACAPA');
    expect(r).not.toMatch(/R\$/);
  });
});

describe('traduzir — a resposta da IA, conferida', () => {
  it('pedido completo vira ações com a descrição montada por nós', () => {
    const { acoes, naoEntendi } = traduzir(
      {
        acoes: [
          {
            tipo: 'refazer_modelo',
            pagina: 2,
            instrucao: 'sorrindo, luz de dia',
          },
          { tipo: 'tirar_peca', codigo: 'co1' },
          { tipo: 'trocar_frase', frase: 'Verão sem fim' },
        ],
        nao_entendi: ['"baixa o preço" — preço vem do sistema'],
      },
      contexto(),
    );

    expect(acoes.map((a) => a.descricao)).toEqual([
      'Página 2: refazer a foto da modelo — sorrindo, luz de dia',
      'Tirar CO1 do catálogo (hoje na página 3)',
      'Capa: a frase passa a ser "Verão sem fim"',
    ]);
    expect(acoes[1]).toMatchObject({ tipo: 'tirar_peca', fotoId: 'co1' });
    expect(naoEntendi).toEqual(['"baixa o preço" — preço vem do sistema']);
  });

  it('página errada NÃO vira ação — vira "não entendi" com o motivo', () => {
    // A IA disse página 3 (joias) para refazer modelo: não vale.
    const { acoes, naoEntendi } = traduzir(
      { acoes: [{ tipo: 'refazer_modelo', pagina: 3, instrucao: 'sorrindo' }] },
      contexto(),
    );

    expect(acoes).toHaveLength(0);
    expect(naoEntendi[0]).toContain('não é uma página de modelo');
  });

  it('código que não está no catálogo não vira ação', () => {
    const { acoes, naoEntendi } = traduzir(
      { acoes: [{ tipo: 'tirar_peca', codigo: 'XX999' }] },
      contexto(),
    );

    expect(acoes).toHaveLength(0);
    expect(naoEntendi[0]).toContain('XX999');
  });

  it.each([
    ['frase com preço', { tipo: 'trocar_frase', frase: 'Tudo por R$ 999' }],
    ['frase com parcela', { tipo: 'trocar_frase', frase: 'Em 10x sem juros' }],
    [
      'cor que não é cor',
      {
        tipo: 'mudar_cores',
        fundo: 'azul',
        destaque: '#000000',
        texto: '#000000',
      },
    ],
    ['ação inventada', { tipo: 'mudar_preco', codigo: 'AN1' }],
  ])('%s é recusada', (_, item) => {
    const { acoes, naoEntendi } = traduzir({ acoes: [item] }, contexto());

    expect(acoes).toHaveLength(0);
    expect(naoEntendi).toHaveLength(1);
  });

  it('catálogo SEM TEMA: modelo, arte e cores não se ajustam; tirar peça sim', () => {
    const plano = { ...PLANO(), direcao: null, arquivos: {} };
    plano.paginas = [
      { tipo: 'capa' },
      { tipo: 'grade', fotoIds: ['an1', 'co1', 'br1'] },
      { tipo: 'contracapa' },
    ];

    const { acoes, naoEntendi } = traduzir(
      {
        acoes: [
          { tipo: 'refazer_capa', instrucao: 'mais clara' },
          { tipo: 'tirar_peca', codigo: 'BR1' },
        ],
      },
      contexto(plano),
    );

    expect(acoes.map((a) => a.tipo)).toEqual(['tirar_peca']);
    expect(naoEntendi[0]).toContain('não tem tema');
  });

  it('resposta vazia ou quebrada não quebra', () => {
    expect(traduzir(null, contexto())).toEqual({ acoes: [], naoEntendi: [] });
    expect(traduzir({ acoes: 'x' }, contexto())).toEqual({
      acoes: [],
      naoEntendi: [],
    });
  });
});

describe('conferir — o que volta da tela é conferido de novo', () => {
  it('ação válida passa; peça de fora é recusada', () => {
    const { acoes, erros } = conferir(
      [
        { tipo: 'tirar_peca', fotoId: 'co1', descricao: 'qualquer' },
        { tipo: 'tirar_peca', fotoId: 'de-outro-catalogo' },
      ],
      contexto(),
    );

    expect(acoes).toEqual([{ tipo: 'tirar_peca', fotoId: 'co1' }]);
    expect(erros).toHaveLength(1);
  });

  it('tirar a única peça não deixa o catálogo vazio', () => {
    const ctx = contexto();
    ctx.pecas = new Map([['an1', { codigo: 'AN1', descricao: null }]]);

    expect(
      conferir([{ tipo: 'tirar_peca', fotoId: 'an1' }], ctx).erros[0],
    ).toContain('única peça');
  });
});

describe('aplicarNoPlano — o plano novo', () => {
  it('não altera o plano recebido', () => {
    const plano = PLANO();
    aplicarNoPlano(plano, [{ tipo: 'tirar_peca', fotoId: 'co1' }], contexto());

    expect(plano).toEqual(PLANO());
  });

  it('refazer a modelo só pede a geração — as páginas ficam', () => {
    const r = aplicarNoPlano(
      PLANO(),
      [{ tipo: 'refazer_modelo', fotoId: 'an1', instrucao: 'sorrindo' }],
      contexto(),
    );

    expect(r.plano.paginas).toEqual(PLANO().paginas);
    expect(r.gerar).toEqual([
      { tipo: 'modelo', fotoId: 'an1', instrucao: 'sorrindo' },
    ]);
  });

  it('tirar a peça da modelo leva a página junto, e a imagem deixa de valer', () => {
    const r = aplicarNoPlano(
      PLANO(),
      [{ tipo: 'tirar_peca', fotoId: 'an1' }],
      contexto(),
    );

    expect(r.plano.paginas).toEqual([
      { tipo: 'capa' },
      { tipo: 'grade', fotoIds: ['co1', 'br1'] },
      { tipo: 'contracapa' },
    ]);
    expect(r.removidas).toEqual(['modelo:an1']);
  });

  it('trocar a modelo: a nova sobe, a antiga desce para o lugar dela', () => {
    const r = aplicarNoPlano(
      PLANO(),
      [
        {
          tipo: 'trocar_modelo',
          fotoId: 'an1',
          novaFotoId: 'co1',
          instrucao: null,
        },
      ],
      contexto(),
    );

    expect(r.plano.paginas).toEqual([
      { tipo: 'capa' },
      { tipo: 'modelo', fotoId: 'co1' },
      { tipo: 'grade', fotoIds: ['an1', 'br1'] },
      { tipo: 'contracapa' },
    ]);
    expect(r.removidas).toEqual(['modelo:an1']);
    expect(r.gerar).toEqual([
      { tipo: 'modelo', fotoId: 'co1', instrucao: null },
    ]);
  });

  it('mover para a página da capa cria uma página de joias logo depois', () => {
    const r = aplicarNoPlano(
      PLANO(),
      [{ tipo: 'mover_peca', fotoId: 'br1', pagina: 1 }],
      contexto(),
    );

    expect(r.plano.paginas).toEqual([
      { tipo: 'capa' },
      { tipo: 'grade', fotoIds: ['br1'] },
      { tipo: 'modelo', fotoId: 'an1' },
      { tipo: 'grade', fotoIds: ['co1'] },
      { tipo: 'contracapa' },
    ]);
  });

  it('o destino do "mover" é a página que a pessoa VIU, mesmo depois de tirar outra', () => {
    // Tira AN1 (some a página 2) e leva BR1 "para a página 3" — a página 3
    // que ela viu é a grade de joias, e não o que virou página 3 depois.
    const ctx = contexto();
    const r = aplicarNoPlano(
      PLANO(),
      [
        { tipo: 'tirar_peca', fotoId: 'an1' },
        { tipo: 'mover_peca', fotoId: 'br1', pagina: 3 },
      ],
      ctx,
    );

    expect(r.plano.paginas).toEqual([
      { tipo: 'capa' },
      { tipo: 'grade', fotoIds: ['co1', 'br1'] },
      { tipo: 'contracapa' },
    ]);
  });

  it('frase e cores mudam na direção de arte; arte pede geração', () => {
    const r = aplicarNoPlano(
      PLANO(),
      [
        { tipo: 'trocar_frase', frase: 'Verão sem fim' },
        {
          tipo: 'mudar_cores',
          paleta: { fundo: '#fff8f0', destaque: '#2a9d8f', texto: '#1d3557' },
        },
        { tipo: 'refazer_capa', instrucao: 'pôr do sol' },
      ],
      contexto(),
    );

    expect(r.plano.direcao?.frase).toBe('Verão sem fim');
    expect(r.plano.direcao?.paleta.destaque).toBe('#2a9d8f');
    expect(r.gerar).toEqual([{ tipo: 'capa', instrucao: 'pôr do sol' }]);
  });
});
