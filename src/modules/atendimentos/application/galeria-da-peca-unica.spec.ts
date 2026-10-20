import { ConsultarProdutosVendedoraUseCase } from './use-cases/consultar-produtos-vendedora.use-case';

/**
 * ============================================================================
 * UMA PEÇA SÓ: VÃO TODAS AS FOTOS DELA — 20/10/2026.
 *
 * Teste do Lucas, com print: ele escreveu *"foto da produtos BR26396"* e
 * recebeu **uma** foto, com a peça tendo três guardadas. Perguntou: *"só
 * mandou uma foto, e as outras 2?"*.
 *
 * A causa: a consulta manda a CAPA de cada peça — faz sentido numa lista de
 * dez, onde a imagem ilustra a linha. Não faz quando a busca resolve em uma
 * peça só: aí não há lista para ilustrar, há uma joia para ver.
 *
 * E REPARE NO QUE ISTO **NÃO** É: não é mais uma frase reconhecida. A regra
 * olha o RESULTADO, não o texto — é o que sobra quando a pergunta pode vir de
 * qualquer jeito, inclusive torto como aquela.
 * ============================================================================
 */
describe('a galeria quando a busca resolve em uma peça só', () => {
  const PECA = {
    id: 'p-1',
    codigoErp: 'BR26396',
    categoria: 'JEWEL',
    familia: 'BRINCO',
    descricaoEtiqueta: 'BRINCO DTS 0.25 CTS OB 18K',
    valorVenda: 19900,
    estoqueAtual: 1,
    fotoArquivoId: 'produtos/BR26396/capa.jpg',
    fotoUrl: 'http://conexa/x.jpg',
  };

  const listar = (produtos: unknown[]) => ({
    execute: jest.fn().mockResolvedValue(produtos),
    contar: jest.fn().mockResolvedValue(produtos.length),
  });

  let fotos: { buscar: jest.Mock; quaisTemFoto: jest.Mock };
  let galeria: { listar: jest.Mock };

  beforeEach(() => {
    fotos = {
      buscar: jest
        .fn()
        .mockResolvedValue({ fotos: [], tinhamUrl: 0, cortadas: 0 }),
      quaisTemFoto: jest.fn(),
    };
    galeria = { listar: jest.fn().mockResolvedValue([]) };
  });

  const comTresFotos = () =>
    galeria.listar.mockResolvedValue([
      { arquivoId: 'produtos/BR26396/capa.jpg', capa: true },
      { arquivoId: 'produtos/BR26396/b.jpg', capa: false },
      { arquivoId: 'produtos/BR26396/c.jpg', capa: false },
    ]);

  /* ESTE É O TESTE: três guardadas, três pedidas. */
  it('pede TODAS as fotos da peça, e não só a capa', async () => {
    comTresFotos();
    const uc = new ConsultarProdutosVendedoraUseCase(
      listar([PECA]) as never,
      fotos as never,
      galeria as never,
    );

    const r = await uc.execute('BR26396');

    expect(fotos.buscar).toHaveBeenCalledTimes(1);
    const [pedidos, elaPediu] = fotos.buscar.mock.calls[0] as [
      { chave: string | null }[],
      boolean,
    ];
    expect(pedidos).toHaveLength(3);
    expect(pedidos.map((p) => p.chave)).toEqual([
      'produtos/BR26396/capa.jpg',
      'produtos/BR26396/b.jpg',
      'produtos/BR26396/c.jpg',
    ]);
    // `true` = ela pediu, então vale o teto maior.
    expect(elaPediu).toBe(true);
    expect(r.tinhamFoto).toBe(3);
  });

  it('a capa vai MARCADA na legenda — a lista tem ordem e dono', async () => {
    comTresFotos();
    const uc = new ConsultarProdutosVendedoraUseCase(
      listar([PECA]) as never,
      fotos as never,
      galeria as never,
    );

    await uc.execute('BR26396');

    const [pedidos] = fotos.buscar.mock.calls[0] as [{ legenda: string }[]];
    expect(pedidos[0].legenda).toContain('(capa)');
    expect(pedidos[1].legenda).not.toContain('(capa)');
  });

  it('com DUAS peças, volta a ser uma foto por peça', async () => {
    comTresFotos();
    const uc = new ConsultarProdutosVendedoraUseCase(
      listar([PECA, { ...PECA, id: 'p-2', codigoErp: 'BR26397' }]) as never,
      fotos as never,
      galeria as never,
    );

    await uc.execute('brinco');

    const [pedidos] = fotos.buscar.mock.calls[0] as [{ chave: string }[]];
    expect(pedidos).toHaveLength(2);
    // A galeria nem é consultada: a pergunta era sobre uma lista.
    expect(galeria.listar).not.toHaveBeenCalled();
  });

  it('uma peça com UMA foto nossa segue o caminho de sempre', async () => {
    galeria.listar.mockResolvedValue([
      { arquivoId: 'produtos/BR26396/capa.jpg', capa: true },
    ]);
    const uc = new ConsultarProdutosVendedoraUseCase(
      listar([PECA]) as never,
      fotos as never,
      galeria as never,
    );

    await uc.execute('BR26396');

    const [pedidos] = fotos.buscar.mock.calls[0] as [{ chave: string }[]];
    expect(pedidos).toHaveLength(1);
  });

  /**
   * O CONTEXTO DA PEÇA SOBE PARA QUEM SABE O CHAT — 20/10/2026.
   *
   * Teste do Lucas: ele pediu as fotos do BR26396 **pela agente**, mandou uma
   * imagem, e a pergunta de destino veio genérica ("me diz o código dela") —
   * porque só o caminho determinístico registrava contexto, e o da agente não.
   *
   * O caso de uso não conhece sessão de WhatsApp, e não deve. Então ele
   * devolve a peça, e quem sabe o chat registra.
   */
  it('devolve a PEÇA quando a busca resolve em uma só', async () => {
    comTresFotos();
    const uc = new ConsultarProdutosVendedoraUseCase(
      listar([PECA]) as never,
      fotos as never,
      galeria as never,
    );

    const r = await uc.execute('BR26396');

    expect(r.pecaUnica).toEqual({
      produtoId: 'p-1',
      codigoErp: 'BR26396',
      rotulo: 'BR26396 — BRINCO DTS 0.25 CTS OB 18K',
    });
  });

  it('com duas peças NÃO devolve peça — não há contexto único', async () => {
    const uc = new ConsultarProdutosVendedoraUseCase(
      listar([PECA, { ...PECA, id: 'p-2', codigoErp: 'BR26397' }]) as never,
      fotos as never,
      galeria as never,
    );

    const r = await uc.execute('brinco');

    expect(r.pecaUnica).toBeUndefined();
  });

  it('galeria que falha não derruba a consulta', async () => {
    galeria.listar.mockRejectedValue(new Error('S3 fora'));
    const uc = new ConsultarProdutosVendedoraUseCase(
      listar([PECA]) as never,
      fotos as never,
      galeria as never,
    );

    const r = await uc.execute('BR26396');

    expect(r.produtos).toHaveLength(1);
    expect(fotos.buscar).toHaveBeenCalled();
  });
});
