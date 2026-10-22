import { PdfDeFotosUseCase } from './pdf-de-fotos.use-case';

/**
 * O CATÁLOGO EM PDF, UMA FOTO POR PÁGINA — RF47, 22/10/2026.
 *
 * ============================================================================
 * A ESPECIFICAÇÃO INTEIRA É UMA FRASE DELE:
 *
 *   *"As fotos já são a página inteira, e os preços já estão nas fotos. O que
 *   falta é pegar a foto e colocar no PDF inteiro."*
 *
 * Então estes testes guardam o que NÃO se faz tanto quanto o que se faz: nada
 * é desenhado por cima, e a página tem o tamanho da imagem — folha A4 com uma
 * foto 9:16 dentro deixaria tarja branca, e o que vai para a cliente é a
 * imagem, não uma folha com a imagem dentro.
 * ============================================================================
 */
describe('o catálogo em PDF', () => {
  // Um JPEG com cabeçalho de 1000x1500 — o pdfkit lê a dimensão dali, e é
  // dela que sai o tamanho da página. Folha de verdade é o que faz o teste
  // das páginas fantasma valer: numa de 2x3 pontos, nada estoura.
  const JPEG_2x3 = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAXcA+gBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
    'base64',
  );

  const foto = (id: string, posicao: number) => ({
    id,
    posicao,
    // O CÓDIGO É O QUE ELA DIZ na conversa; o id é um uuid que ela nunca viu.
    codigoErp: `AN2630${posicao}`,
    arquivoId: `catalogo/0042/originais/${id}.jpg`,
    arquivoOriginalId: null,
  });

  const montar = (over: Record<string, unknown> = {}) => {
    const repositorio = {
      registrarFinal: jest.fn().mockResolvedValue({ id: 'fin-1' }),
      buscarPorId: jest.fn().mockResolvedValue({
        id: 'cat-1',
        numero: '0042',
        nome: 'Under 25k',
        fotos: [foto('f2', 2), foto('f1', 1), foto('f3', 3)],
        ...over,
      }),
    };
    const armazenamento = {
      ler: jest.fn().mockResolvedValue({ conteudo: JPEG_2x3, mime: 'image/jpeg' }),
      guardar: jest.fn().mockResolvedValue('catalogo/0042/finais/novo.pdf'),
    };
    return {
      uc: new PdfDeFotosUseCase(repositorio as never, armazenamento as never),
      repositorio,
      armazenamento,
    };
  };

  /** Quantas folhas o PDF tem — contadas no próprio arquivo. */
  const paginas = (b: Buffer): number =>
    (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

  /** Quantas folhas o PDF tem — uma `/MediaBox` por página. */
  const folhas = (b: Buffer): number =>
    (b.toString('latin1').match(/\/MediaBox/g) ?? []).length;

  /**
   * ==========================================================================
   * O TEXTO DA CAPA NÃO PODE CRIAR PÁGINA — 22/10/2026, visto em produção.
   *
   * O primeiro PDF com capa saiu com SETE páginas para três fotos: o nome em
   * corpo proporcional à largura ficou mais largo que a folha, o pdfkit
   * quebrou a linha mesmo com `lineBreak: false`, e o pedaço que passava da
   * borda de baixo virou página nova — em branco, com metade do nome.
   *
   * É a mesma armadilha de 21/10 no relatório, e foi a segunda vez. Por isso
   * agora ela tem teste, e com nome comprido, que é quando ela aparece.
   * ==========================================================================
   */
  it.each([
    ['Under 25k'],
    ['New Opala'],
    ['Coleção de fim de ano com nome bem comprido'],
  ])('o PDF tem as páginas das fotos, e nem uma a mais — "%s"', async (nome) => {
    const { uc } = montar();

    const r = await uc.execute('cat-1', null, nome);

    expect(r.paginas).toBe(4);
    expect(folhas(r.conteudo)).toBe(4);
  });

  /* ESTE É O TESTE: capa de graça, e a peça continua na página dela. */
  it('abre com capa e mostra TODAS as fotos depois', async () => {
    const { uc } = montar();

    const r = await uc.execute('cat-1');

    // 3 fotos + a capa. A primeira foto aparece duas vezes, e isso é o
    // pedido: a capa tem marca e nome por cima; a página da peça é limpa.
    expect(r.paginas).toBe(4);
    expect(r.capa).toEqual({ codigo: 'AN26301', texto: 'Under 25k' });
  });

  it('cada arquivo é lido UMA vez, mesmo repetindo na capa', async () => {
    const { uc, armazenamento } = montar();

    await uc.execute('cat-1');

    // A ordem é a `posicao`, e não a que o banco devolveu — e a foto da capa
    // não é baixada duas vezes.
    expect(armazenamento.ler.mock.calls.map((c) => c[0])).toEqual([
      'catalogo/0042/originais/f1.jpg',
      'catalogo/0042/originais/f2.jpg',
      'catalogo/0042/originais/f3.jpg',
    ]);
  });

  it('é um PDF de verdade', async () => {
    const { uc } = montar();

    const r = await uc.execute('cat-1');

    expect(r.conteudo.subarray(0, 5).toString()).toBe('%PDF-');
    expect(r.nome).toBe('catalogo-0042-under-25k.pdf');
  });

  it('a capa escolhida abre o PDF, e a peça segue na página dela', async () => {
    const { uc, armazenamento } = montar();

    const r = await uc.execute('cat-1', 'f3');

    expect(r.paginas).toBe(4);
    expect(r.capa?.codigo).toBe('AN26303');
    expect(armazenamento.ler.mock.calls.map((c) => c[0])).toEqual([
      'catalogo/0042/originais/f3.jpg',
      'catalogo/0042/originais/f1.jpg',
      'catalogo/0042/originais/f2.jpg',
    ]);
  });

  it('capa que não é deste catálogo cai na primeira foto', async () => {
    const { uc } = montar();

    const r = await uc.execute('cat-1', 'de-outro');

    expect(r.paginas).toBe(4);
    expect(r.capa?.codigo).toBe('AN26301');
  });

  // ==========================================================================
  // O TEXTO DA CAPA É O QUE ELA PEDIR — no vídeo ela troca sem trocar a
  // coleção: *"tirar o Under 25k e colocar News"*.
  // ==========================================================================
  it('o texto da capa é o que ela pediu, e não o nome do catálogo', async () => {
    const { uc } = montar();

    const r = await uc.execute('cat-1', null, 'News');

    expect(r.capa?.texto).toBe('News');
  });

  it('sem texto pedido, vale o nome do catálogo', async () => {
    const { uc } = montar();

    expect((await uc.execute('cat-1', null, '   ')).capa?.texto).toBe(
      'Under 25k',
    );
  });

  // ==========================================================================
  // A CAPA VEM PELO CÓDIGO DA PEÇA — e era aí que estava o defeito.
  //
  // A primeira versão comparava só com o id da foto (um uuid), e a ferramenta
  // pede à agente o CÓDIGO. Nunca casava, e a capa era ignorada EM SILÊNCIO:
  // o PDF saía na ordem normal e ninguém sabia por quê.
  // ==========================================================================
  it('acha a capa pelo CÓDIGO da peça, e não só pelo id da foto', async () => {
    const { uc, armazenamento } = montar();

    await uc.execute('cat-1', 'AN26303');

    expect(armazenamento.ler.mock.calls[0][0]).toBe(
      'catalogo/0042/originais/f3.jpg',
    );
  });

  it('e o código pode vir em minúscula, como ela digita', async () => {
    const { uc, armazenamento } = montar();

    await uc.execute('cat-1', 'an26302');

    expect(armazenamento.ler.mock.calls[0][0]).toBe(
      'catalogo/0042/originais/f2.jpg',
    );
  });

  // ==========================================================================
  // O NOME DO CATÁLOGO VAI ESCRITO NA CAPA — escolha dele em 22/10: *"letra
  // A"*, a foto dela com o texto escrito por nós, em vez de mandar a imagem
  // ao modelo para reescrever a palavra.
  //
  // Sem capa escolhida não há texto: o PDF é só a sequência de fotos, e
  // escrever sobre a primeira peça estragaria a página dela.
  // ==========================================================================
  // ==========================================================================
  // LINHA SEM OBJETO É INCONSISTÊNCIA NOSSA, e não caminho feliz: a foto some
  // do PDF, o resto continua, e o log diz qual foi.
  // ==========================================================================
  it('foto que não está no armazenamento não derruba o PDF', async () => {
    const { uc, armazenamento } = montar();
    armazenamento.ler
      .mockResolvedValueOnce({ conteudo: JPEG_2x3, mime: 'image/jpeg' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ conteudo: JPEG_2x3, mime: 'image/jpeg' });

    const r = await uc.execute('cat-1');

    // A capa (f1) e a página dela, mais a f3. A f2 sumiu com o arquivo.
    expect(r.paginas).toBe(3);
  });

  // ==========================================================================
  // O PDF TAMBÉM FICA NO PAINEL — achado no primeiro teste em produção, em
  // 22/10: *"o pdf criado não foi para o painel"*.
  //
  // Ela gera pela conversa, mas quem revisa e manda para a cliente trabalha na
  // tela. Arquivo que só existe no WhatsApp some no primeiro "limpar
  // conversa", e o painel continuaria dizendo "ainda não montado".
  // ==========================================================================
  it('grava o PDF na pasta do catálogo e registra a versão', async () => {
    const { uc, armazenamento, repositorio } = montar();

    const r = await uc.execute('cat-1');

    expect(armazenamento.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ mime: 'application/pdf', nomeOriginal: r.nome }),
      'catalogo/0042/finais',
    );
    expect(repositorio.registrarFinal).toHaveBeenCalledWith(
      'cat-1',
      expect.objectContaining({
        // A tela lê 'IA' como "Montado pelo sistema" — e foi o sistema.
        origem: 'IA',
        arquivoId: 'catalogo/0042/finais/novo.pdf',
        nomeArquivo: r.nome,
        enviadoPor: null,
      }),
    );
  });

  it('catálogo sem foto nenhuma não vira PDF vazio', async () => {
    const { uc } = montar({ fotos: [] });

    await expect(uc.execute('cat-1')).rejects.toThrow(/nenhuma foto/i);
  });

  it('catálogo que não existe é erro, e não PDF em branco', async () => {
    const repositorio = { buscarPorId: jest.fn().mockResolvedValue(null) };
    const uc = new PdfDeFotosUseCase(
      repositorio as never,
      { ler: jest.fn(), guardar: jest.fn() } as never,
    );

    await expect(uc.execute('cat-1')).rejects.toThrow(/não encontrado/i);
  });

  // 40 páginas já é um arquivo que ninguém abre no celular; o corte é dito
  // em `cortadas`, para quem chama poder avisar em vez de calar.
  it('corta no teto e diz quantas ficaram de fora', async () => {
    const muitas = Array.from({ length: 45 }, (_, i) => foto(`f${i}`, i));
    const { uc } = montar({ fotos: muitas });

    const r = await uc.execute('cat-1');

    // 45 fotos + a capa = 46 na fila; 40 cabem.
    expect(r.paginas).toBe(40);
    expect(r.cortadas).toBe(6);
  });
});
