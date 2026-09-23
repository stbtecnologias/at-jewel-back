import { BadRequestException } from '@nestjs/common';
import { inflateSync } from 'node:zlib';
import PDFDocument from 'pdfkit';
import {
  disposicaoDaGrade,
  MontarCatalogoUseCase,
  ondeVai,
  repartir,
} from './montar-catalogo.use-case';

/**
 * O TEXTO QUE O PDF DE FATO IMPRIMIU.
 *
 * Duas camadas escondem o texto de uma comparação ingênua no buffer:
 *
 *   1. o PDFKit COMPRIME os fluxos de conteúdo (FlateDecode);
 *   2. dentro deles, a string vai em HEXADECIMAL —
 *      `[<42523236323532> 0] TJ`, e não entre parênteses.
 *
 * Um `toContain` no arquivo cru passaria em silêncio, testando nada. Aqui os
 * fluxos são inflados e os blocos `<...>` decodificados.
 *
 * Junta-se TUDO de propósito: uma frase pode sair partida em vários operadores
 * por causa de kerning, e comparar pedaço a pedaço quebraria o teste sem que
 * nada estivesse errado.
 *
 * O bullet fica de fora das comparações — ele é 0x95 na codificação do PDF e
 * não bate com o `•` do nosso código-fonte. Conferir as duas metades separadas
 * verifica o mesmo sem depender de codificação.
 */
function textoImpresso(pdf: Buffer): string {
  const pedacos: string[] = [];
  let i = 0;

  for (;;) {
    const abre = pdf.indexOf('stream', i);
    if (abre === -1) break;
    const fecha = pdf.indexOf('endstream', abre);
    if (fecha === -1) break;

    let dados = abre + 'stream'.length;
    if (pdf[dados] === 0x0d) dados++;
    if (pdf[dados] === 0x0a) dados++;

    try {
      const conteudo = inflateSync(pdf.subarray(dados, fecha)).toString(
        'latin1',
      );
      for (const m of conteudo.matchAll(/<([0-9A-Fa-f]+)>/g)) {
        pedacos.push(Buffer.from(m[1], 'hex').toString('latin1'));
      }
    } catch {
      // Fluxo que não é texto comprimido (a imagem, por exemplo). Segue.
    }

    i = fecha + 'endstream'.length;
  }

  return pedacos.join('');
}

/**
 * A MONTAGEM DO CATÁLOGO EM PDF.
 *
 * O que estes testes protegem é a promessa que dá nome ao arquivo: **nenhum
 * modelo desenha esta página**. O dado que chega ao PDF é o dado do ERP, e a
 * foto é a que foi aprovada — nada é gerado, nada é reescrito. É por isso que
 * o teste do preço existe: num catálogo, dígito é dinheiro.
 *
 * O conteúdo do PDF é lido como texto bruto. PDFKit não comprime os fluxos de
 * texto por padrão, então as strings desenhadas aparecem legíveis no buffer —
 * o que faz destes testes uma verificação do que de fato foi impresso, e não
 * do que a gente pretendia imprimir.
 */
describe('MontarCatalogoUseCase', () => {
  const FOTO = (extra: Record<string, unknown> = {}) => ({
    id: 'f-1',
    catalogoId: 'cat-1',
    posicao: 1,
    codigoErp: 'BR26252',
    descricao: 'Brinco Rubi 0.63 cts',
    precoAVista: 44900,
    parcelas: 10,
    jurosPercentual: null,
    origem: 'WHATSAPP',
    remetente: 'Faby',
    arquivoOriginalId: 'catalogo/0001/originais/a.jpg',
    arquivoId: 'catalogo/0001/fotos/a.png',
    status: 'APROVADA',
    versoes: 1,
    aprovadoPor: 'Faby',
    aprovadoEm: new Date(),
    ...extra,
  });

  const CATALOGO = (fotos: unknown[], extra: Record<string, unknown> = {}) => ({
    id: 'cat-1',
    numero: '0001',
    nome: 'Catálogo Rosa Pink',
    tema: 'Mundo Rosa',
    formato: '9:16',
    referencias: [],
    fotos,
    finalArquivoId: null,
    ...extra,
  });

  // PNG 1x1 válido: o PDFKit decodifica de verdade, então não serve
  // Buffer.from('img').
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  let repo: {
    buscarPorId: jest.Mock;
    registrarFinal: jest.Mock;
  };
  let armazenamento: {
    ler: jest.Mock;
    guardar: jest.Mock;
    guardarEm: jest.Mock;
    remover: jest.Mock;
  };
  let ia: { ambientar: jest.Mock; gerarArte: jest.Mock };
  let estilo: { direcao: jest.Mock };
  let useCase: MontarCatalogoUseCase;

  /** O texto que o PDF gravado no armazenamento de fato imprimiu. */
  function pdfGravado(): string {
    const [arquivo] = armazenamento.guardar.mock.calls[0] as [
      { conteudo: Buffer },
    ];
    return textoImpresso(arquivo.conteudo);
  }

  beforeEach(() => {
    repo = {
      buscarPorId: jest.fn(),
      registrarFinal: jest.fn().mockResolvedValue({ id: 'fin-1' }),
    };
    armazenamento = {
      ler: jest.fn().mockResolvedValue({ conteudo: PNG, mime: 'image/png' }),
      guardar: jest.fn().mockResolvedValue('catalogo/0001/finais/x.pdf'),
      guardarEm: jest.fn().mockResolvedValue(undefined),
      remover: jest.fn().mockResolvedValue(undefined),
    };
    ia = {
      ambientar: jest.fn().mockResolvedValue(null),
      gerarArte: jest.fn().mockResolvedValue(null),
    };
    // Sem observacao, sem tema: o catalogo de sempre.
    estilo = { direcao: jest.fn().mockResolvedValue(null) };
    useCase = new MontarCatalogoUseCase(
      repo as never,
      armazenamento as never,
      ia as never,
      estilo as never,
    );
  });

  it('o preço vai EXATO, e o parcelado é calculado dele', async () => {
    // A razão de existir deste use case em vez de pedir a página a um modelo.
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([FOTO({ precoAVista: 35920, parcelas: 10 })]),
    );

    await useCase.execute('cat-1');
    const pdf = pdfGravado();

    expect(pdf).toContain('R$35.920,00 a vista');
    // 35.920 / 10, sem acréscimo: a divisão por 0,80 caiu em 04/09/2026.
    expect(pdf).toContain('10 X R$3.592,00');
  });

  it('o descritivo sai no padrão impresso, em caixa alta', async () => {
    repo.buscarPorId.mockResolvedValue(CATALOGO([FOTO()]));

    await useCase.execute('cat-1');
    const pdf = pdfGravado();

    // A descrição chega em caixa baixa do ERP e sai em caixa alta, como nas
    // páginas de referência.
    expect(pdf).toContain('BR26252');
    expect(pdf).toContain('BRINCO RUBI 0.63 CTS');
    expect(pdf).not.toContain('Brinco Rubi');
  });

  it('só as APROVADAS viram página', async () => {
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([
        FOTO({ id: 'f-1' }),
        FOTO({ id: 'f-2', status: 'EM_APROVACAO' }),
        FOTO({ id: 'f-3', status: 'REPROVADA' }),
      ]),
    );

    await useCase.execute('cat-1');

    expect(armazenamento.ler).toHaveBeenCalledTimes(1);
  });

  it('sem foto aprovada, recusa em vez de montar um PDF só com capa', async () => {
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([FOTO({ status: 'EM_APROVACAO' })]),
    );

    await expect(useCase.execute('cat-1')).rejects.toThrow(BadRequestException);
    expect(armazenamento.guardar).not.toHaveBeenCalled();
  });

  it('a capa leva nome, tema e a contagem de peças', async () => {
    repo.buscarPorId.mockResolvedValue(CATALOGO([FOTO(), FOTO({ id: 'f-2' })]));

    await useCase.execute('cat-1');
    const pdf = pdfGravado();

    expect(pdf).toContain('CATÁLOGO ROSA PINK');
    expect(pdf).toContain('Mundo Rosa');
    expect(pdf).toContain('2 peças');
  });

  it('peça sem preço imprime "SOB CONSULTA", e não um vazio', async () => {
    // Vazio embaixo do código não diz se o preço foi esquecido ou se é sob
    // consulta, e as duas leituras custam uma ligação. `R$ 0,00` seria pior
    // ainda: parece preço.
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([FOTO({ precoAVista: null, parcelas: null })]),
    );

    await useCase.execute('cat-1');
    const pdf = pdfGravado();

    expect(pdf).toContain('BR26252');
    expect(pdf).toContain('PREÇO SOB CONSULTA');
    expect(pdf).not.toContain('a vista');
  });

  it('o juro informado manda na parcela; sem ele, não há acréscimo', async () => {
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([
        FOTO({
          id: 'f-1',
          codigoErp: 'COM',
          precoAVista: 44900,
          parcelas: 12,
          jurosPercentual: 15,
        }),
        FOTO({ id: 'f-2', codigoErp: 'SEM', precoAVista: 44900, parcelas: 10 }),
      ]),
    );

    await useCase.execute('cat-1');
    const pdf = pdfGravado();

    // 44.900 x 1,15 / 12 — o percentual escrito na legenda.
    expect(pdf).toContain('12 X R$4.302,92');
    // 44.900 / 10, e nada mais. Até 04/09/2026 esta linha saía R$5.612,50,
    // porque o valor era dividido por 0,80 antes.
    expect(pdf).toContain('10 X R$4.490,00');
    expect(pdf).not.toContain('R$5.612,50');
  });

  it('mais de oito peças abrem uma página nova', async () => {
    // A paginação da grade. Com nove pecas o PDF tem capa + 2 grades +
    // contracapa: se o corte falhasse, a nona sairia por cima da primeira.
    const nove = Array.from({ length: 9 }, (_, i) =>
      FOTO({ id: `f-${i}`, codigoErp: `BR${i}` }),
    );
    repo.buscarPorId.mockResolvedValue(CATALOGO(nove));

    await useCase.execute('cat-1');
    const [arquivo] = armazenamento.guardar.mock.calls[0] as [
      { conteudo: Buffer },
    ];

    // `/Type /Page` aparece uma vez por página no PDF.
    const paginas = (
      arquivo.conteudo.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []
    ).length;
    expect(paginas).toBe(4);
  });

  /**
   * O TAMANHO SEGUE A QUANTIDADE DE PEÇAS NA PÁGINA — 16/09/2026.
   *
   * "Se for uma, duas, cinco ou dez, dimensiona na página." Uma peça só
   * ficava pequena no canto de cima, com a folha vazia.
   */
  describe('a grade se dimensiona pela quantidade', () => {
    type Chamada = [Buffer, number, number, { fit: [number, number] }];
    let imagem: jest.SpyInstance<unknown, Chamada>;

    // Onde e de que tamanho cada foto foi posta: `doc.image(img, x, y, {fit})`.
    const fotos = () =>
      imagem.mock.calls.map(([, x, y, o]) => ({ x, y, lado: o.fit[0] }));

    const pecas = (n: number) =>
      Array.from({ length: n }, (_, i) => FOTO({ id: `f-${i}` }));

    beforeEach(() => {
      const prototipo = PDFDocument.prototype as unknown as {
        image: (...args: Chamada) => unknown;
      };
      imagem = jest.spyOn(prototipo, 'image');
    });
    afterEach(() => jest.restoreAllMocks());

    async function ladoCom(n: number, formato = '9:16') {
      imagem.mockClear();
      repo.buscarPorId.mockResolvedValue(CATALOGO(pecas(n), { formato }));
      await useCase.execute('cat-1');
      return fotos()[0].lado;
    }

    it('quanto menos peças, maior a foto — 1, 2, 5 e 8', async () => {
      const uma = await ladoCom(1);
      const duas = await ladoCom(2);
      const cinco = await ladoCom(5);
      const oito = await ladoCom(8);

      expect(uma).toBeGreaterThan(duas);
      expect(duas).toBeGreaterThan(cinco);
      expect(cinco).toBeGreaterThan(oito);
    });

    it('uma peça fica no meio da folha', async () => {
      repo.buscarPorId.mockResolvedValue(CATALOGO(pecas(1)));

      await useCase.execute('cat-1');

      const [p] = fotos();
      expect(p.x + p.lado / 2).toBeCloseTo(720 / 2);
    });

    it('três peças em retrato: a terceira fica no meio da linha de baixo', async () => {
      repo.buscarPorId.mockResolvedValue(CATALOGO(pecas(3)));

      await useCase.execute('cat-1');

      const [a, , c] = fotos();
      expect(c.x + c.lado / 2).toBeCloseTo(720 / 2);
      expect(c.y).toBeGreaterThan(a.y);
    });

    it('quatro peças em paisagem ficam numa linha só', async () => {
      repo.buscarPorId.mockResolvedValue(
        CATALOGO(pecas(4), { formato: '16:9' }),
      );

      await useCase.execute('cat-1');

      const ys = new Set(fotos().map((f) => Math.round(f.y)));
      expect(ys.size).toBe(1);
    });

    it('dez peças viram duas páginas de cinco, do mesmo tamanho', async () => {
      repo.buscarPorId.mockResolvedValue(CATALOGO(pecas(10)));

      await useCase.execute('cat-1');

      const lados = new Set(fotos().map((f) => Math.round(f.lado)));
      expect(lados.size).toBe(1);
      // capa + 2 grades + contracapa
      expect(paginas()).toBe(4);
    });
  });

  it.each([
    [8, [8]],
    [9, [5, 4]],
    [10, [5, 5]],
    [17, [6, 6, 5]],
    [0, []],
  ])('repartir(%i) = %j', (n, esperado) => {
    expect(repartir(n)).toEqual(esperado);
  });

  it('duas peças em retrato vão uma embaixo da outra, e não espremidas lado a lado', () => {
    expect(disposicaoDaGrade(2, true, 720, 1280, 0).colunas).toBe(1);
    expect(disposicaoDaGrade(8, true, 720, 1280, 0).colunas).toBe(2);
    expect(disposicaoDaGrade(8, false, 1280, 720, 0).colunas).toBe(4);
  });

  it('a contracapa fecha o documento com a marca', async () => {
    repo.buscarPorId.mockResolvedValue(CATALOGO([FOTO()]));

    await useCase.execute('cat-1');

    // Sem ela o PDF termina numa grade pela metade e parece cortado.
    expect(pdfGravado()).toContain('A.T JEWEL');
  });

  it('foto que sumiu do armazenamento não vira página muda', async () => {
    armazenamento.ler
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ conteudo: PNG, mime: 'image/png' });
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([
        FOTO({ id: 'f-1', codigoErp: 'SUMIU' }),
        FOTO({ id: 'f-2', codigoErp: 'BR26252' }),
      ]),
    );

    await useCase.execute('cat-1');
    const pdf = pdfGravado();

    expect(pdf).not.toContain('SUMIU');
    expect(pdf).toContain('BR26252');
  });

  it('remontar NÃO apaga a versão anterior', async () => {
    // A invariante que a migração 44 existe para garantir: bastava um clique
    // por curiosidade no botão de montar para o arquivo que o marketing tinha
    // enviado sumir do banco e do bucket, sem volta.
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([FOTO()], { finalArquivoId: 'catalogo/0001/finais/velho.pdf' }),
    );

    await useCase.execute('cat-1');

    expect(repo.registrarFinal).toHaveBeenCalled();
    expect(armazenamento.remover).not.toHaveBeenCalled();
  });

  it('grava como IA, sem quem enviou — foi o sistema, não uma pessoa', async () => {
    repo.buscarPorId.mockResolvedValue(CATALOGO([FOTO()]));

    await useCase.execute('cat-1');

    expect(repo.registrarFinal).toHaveBeenCalledWith('cat-1', {
      origem: 'IA',
      arquivoId: 'catalogo/0001/finais/x.pdf',
      nomeArquivo: 'catalogo-0001.pdf',
      mime: 'application/pdf',
      tamanhoBytes: expect.any(Number) as number,
      enviadoPor: null,
    });
  });

  /** `/Type /Page` aparece uma vez por página no PDF. */
  function paginas(): number {
    const [arquivo] = armazenamento.guardar.mock.calls[0] as [
      { conteudo: Buffer },
    ];
    return (
      arquivo.conteudo.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []
    ).length;
  }

  /**
   * COM TEMA — 16/09/2026.
   *
   * "Com o tema você vai seguindo, página com uma modelo e outras sem, apenas
   * as joias, vai mesclando." Sem observação, "deixa branco mesmo".
   */
  describe('com tema (observação no catálogo)', () => {
    const DIRECAO = {
      cena: 'praia ao fim da tarde',
      modelo: 'uma mulher elegante',
      paleta: { fundo: '#f4ece0', destaque: '#2a9d8f', texto: '#1d3557' },
      frase: 'Dias de sol',
    };
    const dez = () =>
      Array.from({ length: 10 }, (_, i) =>
        FOTO({ id: `f-${i}`, codigoErp: `CO${i}`, descricao: 'Colar Opala' }),
      );

    beforeEach(() => {
      estilo.direcao.mockResolvedValue(DIRECAO);
      ia.gerarArte.mockResolvedValue({ conteudo: PNG, mime: 'image/png' });
      ia.ambientar.mockResolvedValue({ conteudo: PNG, mime: 'image/png' });
    });

    it('sem tema, nenhuma imagem é gerada', async () => {
      estilo.direcao.mockResolvedValue(null);
      repo.buscarPorId.mockResolvedValue(CATALOGO(dez()));

      await useCase.execute('cat-1');

      expect(ia.ambientar).not.toHaveBeenCalled();
      expect(ia.gerarArte).not.toHaveBeenCalled();
      expect(pdfGravado()).not.toContain('Imagem ilustrativa');
    });

    it('uma peça na modelo a cada nove — a 1ª e a 10ª', async () => {
      repo.buscarPorId.mockResolvedValue(CATALOGO(dez()));

      await useCase.execute('cat-1');

      const pedidos = (
        ia.ambientar.mock.calls as [
          { onde: string; cena: string; modelo: string },
        ][]
      ).map(([p]) => p);
      expect(pedidos).toHaveLength(2);
      expect(pedidos[0].cena).toBe('praia ao fim da tarde');
      expect(pedidos[0].onde).toContain('pescoço');
      expect(pedidos[0].modelo).toBe('uma mulher elegante');
      // capa + modelo + grade de 8 + modelo + contracapa
      expect(paginas()).toBe(5);
    });

    it('capa e fundo são gerados, na orientação do catálogo', async () => {
      repo.buscarPorId.mockResolvedValue(CATALOGO([FOTO()]));

      await useCase.execute('cat-1');

      const tipos = (
        ia.gerarArte.mock.calls as [{ tipo: string; orientacao: string }][]
      ).map(([p]) => `${p.tipo}:${p.orientacao}`);
      expect(tipos.sort()).toEqual(['capa:retrato', 'fundo:retrato']);
    });

    it('a página da modelo leva o preço EXATO e diz que é ilustrativa', async () => {
      repo.buscarPorId.mockResolvedValue(
        CATALOGO([FOTO({ precoAVista: 35920, parcelas: 10 })]),
      );

      await useCase.execute('cat-1');
      const pdf = pdfGravado();

      expect(pdf).toContain('R$35.920,00 a vista');
      expect(pdf).toContain('10 X R$3.592,00');
      expect(pdf).toContain('Imagem ilustrativa');
    });

    it('a capa leva o nome e a frase da direção de arte', async () => {
      repo.buscarPorId.mockResolvedValue(CATALOGO([FOTO()]));

      await useCase.execute('cat-1');
      const pdf = pdfGravado();

      expect(pdf).toContain('CATÁLOGO ROSA PINK');
      expect(pdf).toContain('Dias de sol');
    });

    it('foto na modelo que falha volta para a grade — a peça não some', async () => {
      ia.ambientar.mockResolvedValue(null);
      repo.buscarPorId.mockResolvedValue(CATALOGO(dez()));

      await useCase.execute('cat-1');
      const pdf = pdfGravado();

      expect(pdf).toContain('CO0');
      expect(pdf).toContain('CO9');
      expect(pdf).not.toContain('Imagem ilustrativa');
      // capa + grade de 8 + grade de 2 + contracapa
      expect(paginas()).toBe(4);
    });

    it('geração que falha ou lança não derruba a montagem', async () => {
      ia.gerarArte.mockResolvedValue(null);
      ia.ambientar.mockRejectedValue(new Error('timeout'));
      repo.buscarPorId.mockResolvedValue(CATALOGO([FOTO()]));

      await useCase.execute('cat-1');

      expect(repo.registrarFinal).toHaveBeenCalled();
      expect(pdfGravado()).toContain('BR26252');
    });

    it('em 16:9 a montagem também fecha', async () => {
      repo.buscarPorId.mockResolvedValue(CATALOGO(dez(), { formato: '16:9' }));

      await useCase.execute('cat-1');

      expect(paginas()).toBe(5);
    });
  });
});

/**
 * O PLANO GUARDADO JUNTO DO PDF — 16/09/2026.
 *
 * É o que permite o ajuste página a página ("na página 4, a modelo sorrindo")
 * sem gerar tudo de novo. Sem migração: `<chave do PDF>.plano.json`, e as
 * imagens ao lado.
 */
describe('MontarCatalogoUseCase — o plano da montagem', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const FOTO = (id: string) => ({
    id,
    codigoErp: `CO-${id}`,
    descricao: 'Colar Opala',
    precoAVista: 1000,
    parcelas: 10,
    jurosPercentual: null,
    arquivoId: `catalogo/0004/fotos/${id}.png`,
    status: 'APROVADA',
  });
  const PDF = 'catalogo/0004/finais/abc.pdf';

  let armazenamento: {
    ler: jest.Mock;
    guardar: jest.Mock;
    guardarEm: jest.Mock;
  };
  let ia: { ambientar: jest.Mock; gerarArte: jest.Mock };
  let estilo: { direcao: jest.Mock };
  let useCase: MontarCatalogoUseCase;

  const montar = (fotos: unknown[]) => {
    const catalogo = {
      id: 'cat-4',
      numero: '0004',
      nome: 'Holiday',
      tema: null,
      formato: '9:16',
      referencias: [],
      fotos,
    };
    useCase = new MontarCatalogoUseCase(
      {
        buscarPorId: jest.fn().mockResolvedValue(catalogo),
        registrarFinal: jest.fn().mockResolvedValue({}),
      } as never,
      armazenamento as never,
      ia as never,
      estilo as never,
    );
    return useCase.execute('cat-4');
  };

  /** O plano que foi gravado, lido de volta do JSON. */
  const planoGravado = () => {
    const chamada = (
      armazenamento.guardarEm.mock.calls as [string, Buffer, string][]
    ).find(([chave]) => chave.endsWith('.plano.json'));
    return chamada
      ? {
          chave: chamada[0],
          plano: JSON.parse(chamada[1].toString()) as {
            direcao: unknown;
            paginas: { tipo: string; fotoId?: string; fotoIds?: string[] }[];
            arquivos: Record<string, string>;
          },
        }
      : null;
  };

  beforeEach(() => {
    armazenamento = {
      ler: jest.fn().mockResolvedValue({ conteudo: PNG, mime: 'image/png' }),
      guardar: jest.fn().mockResolvedValue(PDF),
      guardarEm: jest.fn().mockResolvedValue(undefined),
    };
    ia = {
      ambientar: jest
        .fn()
        .mockResolvedValue({ conteudo: PNG, mime: 'image/jpeg' }),
      gerarArte: jest
        .fn()
        .mockResolvedValue({ conteudo: PNG, mime: 'image/jpeg' }),
    };
    estilo = { direcao: jest.fn().mockResolvedValue(null) };
  });

  it('sem tema, o plano e o catalogo de sempre — e fica ao lado do PDF', async () => {
    await montar([FOTO('a'), FOTO('b')]);

    const gravado = planoGravado();
    expect(gravado?.chave).toBe('catalogo/0004/finais/abc.plano.json');
    expect(gravado?.plano.direcao).toBeNull();
    expect(gravado?.plano.paginas).toEqual([
      { tipo: 'capa' },
      { tipo: 'grade', fotoIds: ['a', 'b'] },
      { tipo: 'contracapa' },
    ]);
    expect(gravado?.plano.arquivos).toEqual({});
  });

  it('com tema, as imagens geradas ficam gravadas e o plano aponta para elas', async () => {
    estilo.direcao.mockResolvedValue({
      cena: 'praia',
      modelo: 'uma mulher elegante',
      paleta: { fundo: '#ffffff', destaque: '#b8912f', texto: '#1a1a1a' },
      frase: null,
    });

    await montar([FOTO('a'), FOTO('b')]);

    const gravado = planoGravado();
    expect(gravado?.plano.paginas).toEqual([
      { tipo: 'capa' },
      { tipo: 'modelo', fotoId: 'a' },
      { tipo: 'grade', fotoIds: ['b'] },
      { tipo: 'contracapa' },
    ]);
    expect(gravado?.plano.arquivos).toEqual({
      capa: 'catalogo/0004/finais/abc.capa.jpg',
      fundo: 'catalogo/0004/finais/abc.fundo.jpg',
      'modelo:a': 'catalogo/0004/finais/abc.modelo-a.jpg',
    });
    const chaves = (armazenamento.guardarEm.mock.calls as [string][]).map(
      ([c]) => c,
    );
    expect(chaves).toEqual(
      expect.arrayContaining(Object.values(gravado!.plano.arquivos)),
    );
  });

  it('o plano NAO guarda preco nem descricao — so o id da foto', async () => {
    await montar([FOTO('a')]);

    const texto = JSON.stringify(planoGravado()?.plano);
    expect(texto).not.toContain('Colar Opala');
    expect(texto).not.toContain('1000');
  });

  it('falhar ao gravar o plano NAO derruba a montagem', async () => {
    armazenamento.guardarEm.mockRejectedValue(new Error('S3 fora'));

    const r = await montar([FOTO('a')]);

    expect(r).toBeDefined();
    expect(armazenamento.guardar).toHaveBeenCalled();
  });
});

describe('ondeVai — onde a peça fica no corpo', () => {
  it.each([
    ['Colar Opala Ouro 18K', 'pescoço'],
    ['GARGANTILHA RIVIERA', 'pescoço'],
    ['Brinco Rubi 0.63 cts', 'orelha'],
    ['ANEL SOLITÁRIO', 'dedo'],
    ['Aliança lisa', 'dedo'],
    ['PULSEIRA TENNIS', 'pulso'],
    ['Broche vintage', 'peito'],
    ['ABOTOADURA ONIX OURO 18K', 'punho'],
    ['Cordão masculino', 'pescoço'],
    ['Caneta tinteiro', 'forma natural'],
    [null, 'forma natural'],
  ])('%s → %s', (descricao, esperado) => {
    expect(ondeVai(descricao)).toContain(esperado);
  });
});
