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
  // Um JPEG 2x3 de verdade, em base64: o pdfkit precisa ler as dimensões do
  // cabeçalho, então não serve um buffer qualquer.
  const JPEG_2x3 = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
      'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAADAAIBAREA/8QAFAABAAAAAAAA' +
      'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
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

  /* ESTE É O TESTE: uma foto, uma página. */
  it('gera uma página por foto, na ordem do catálogo', async () => {
    const { uc, armazenamento } = montar();

    const r = await uc.execute('cat-1');

    expect(r.paginas).toBe(3);
    expect(paginas(r.conteudo)).toBe(3);
    // A ordem é a `posicao`, e não a que o banco devolveu.
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

  // ==========================================================================
  // A CAPA SOBE, E NÃO SE REPETE.
  //
  // Abrir com uma foto e mostrá-la de novo no meio faria o PDF parecer
  // defeito — e quem recebe não sabe que foi escolha.
  // ==========================================================================
  it('a capa escolhida vira a primeira página, uma vez só', async () => {
    const { uc, armazenamento } = montar();

    const r = await uc.execute('cat-1', 'f3');

    expect(r.paginas).toBe(3);
    expect(armazenamento.ler.mock.calls.map((c) => c[0])).toEqual([
      'catalogo/0042/originais/f3.jpg',
      'catalogo/0042/originais/f1.jpg',
      'catalogo/0042/originais/f2.jpg',
    ]);
  });

  it('capa que não é deste catálogo é ignorada, e o PDF sai igual', async () => {
    const { uc } = montar();

    const r = await uc.execute('cat-1', 'de-outro');

    expect(r.paginas).toBe(3);
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
  it('com capa, o nome do catálogo é escrito sobre ela', async () => {
    const { uc } = montar();

    const com = await uc.execute('cat-1', 'AN26303');
    const sem = await uc.execute('cat-1');

    // NÃO DÁ PARA PROCURAR A PALAVRA NO ARQUIVO: o pdfkit comprime o fluxo
    // de desenho (FlateDecode), então o texto não aparece em texto claro. O
    // que se vê de fora é o PDF ficar MAIOR — a fonte embarcada e o desenho
    // do texto pesam, e a sequência de fotos é a mesma nos dois.
    expect(com.conteudo.length).toBeGreaterThan(sem.conteudo.length);
    expect(com.paginas).toBe(sem.paginas);
  });

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

    expect(r.paginas).toBe(2);
    expect(paginas(r.conteudo)).toBe(2);
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

    expect(r.paginas).toBe(40);
    expect(r.cortadas).toBe(5);
  });
});
