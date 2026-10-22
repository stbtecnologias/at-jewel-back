import { RemoverCatalogoUseCase } from './catalogos.use-cases';

/**
 * EXCLUIR O CATÁLOGO — 22/10/2026.
 *
 * ============================================================================
 * ESTE SPEC EXISTE POR CAUSA DE UM ESTRAGO QUE AINDA NÃO ACONTECEU.
 *
 * Até o RF32, toda chave gravada numa linha de catálogo era um arquivo que
 * tinha nascido ali dentro — e apagar tudo junto era seguro. Com o RF32 a peça
 * entra no catálogo APONTANDO para a foto dela, que mora em
 * `produtos/<codigo>/` e serve o painel, a agente e os próximos catálogos.
 *
 * Excluir uma campanha passaria a apagar do disco a foto da PEÇA, e
 * `produto_fotos` ficaria apontando para o nada. O estrago não apareceria na
 * hora: apareceria semanas depois, numa tela com moldura vazia, sem ninguém
 * ligar uma coisa à outra.
 *
 * A regra já estava escrita no armazenamento, antes de existir o risco: *"a
 * foto é da PEÇA, e pendurá-la no catálogo faria a imagem morrer junto com a
 * campanha"*.
 * ============================================================================
 */
describe('remover catálogo', () => {
  const catalogo = (over: Record<string, unknown> = {}) => ({
    id: 'cat-1',
    numero: '0042',
    referencias: [{ arquivoId: 'catalogo/0042/referencias/r1.jpg' }],
    fotos: [{ arquivoId: 'catalogo/0042/originais/f1.jpg' }],
    finalArquivoId: 'catalogo/0042/finais/pdf.pdf',
    ...over,
  });

  const montar = (c: unknown) => {
    const repositorio = {
      buscarPorId: jest.fn().mockResolvedValue(c),
      remover: jest.fn().mockResolvedValue(undefined),
    };
    const armazenamento = { remover: jest.fn().mockResolvedValue(undefined) };
    return {
      uc: new RemoverCatalogoUseCase(
        repositorio as never,
        armazenamento as never,
      ),
      repositorio,
      armazenamento,
    };
  };

  /** As chaves que o armazenamento foi mandado apagar. */
  const apagadas = (a: { remover: jest.Mock }) =>
    a.remover.mock.calls.map((c) => c[0] as string);

  it('apaga os arquivos do próprio catálogo', async () => {
    const { uc, armazenamento, repositorio } = montar(catalogo());

    await uc.execute('cat-1');

    expect(repositorio.remover).toHaveBeenCalledWith('cat-1');
    expect(apagadas(armazenamento)).toEqual([
      'catalogo/0042/referencias/r1.jpg',
      'catalogo/0042/originais/f1.jpg',
      'catalogo/0042/finais/pdf.pdf',
    ]);
  });

  /* ESTE É O TESTE. */
  it('NÃO apaga a foto da peça, que só está emprestada ao catálogo', async () => {
    const { uc, armazenamento } = montar(
      catalogo({
        fotos: [
          { arquivoId: 'produtos/CO26217/abc.jpg' },
          { arquivoId: 'catalogo/0042/originais/f1.jpg' },
        ],
      }),
    );

    await uc.execute('cat-1');

    expect(apagadas(armazenamento)).not.toContain('produtos/CO26217/abc.jpg');
    expect(apagadas(armazenamento)).toContain('catalogo/0042/originais/f1.jpg');
  });

  it('nem a de OUTRO catálogo, se um dia uma chave vier de lá', async () => {
    const { uc, armazenamento } = montar(
      catalogo({ fotos: [{ arquivoId: 'catalogo/0001/originais/x.jpg' }] }),
    );

    await uc.execute('cat-1');

    expect(apagadas(armazenamento)).not.toContain(
      'catalogo/0001/originais/x.jpg',
    );
  });

  // A linha some de qualquer jeito: o filtro é sobre o ARQUIVO, não sobre o
  // catálogo. Quem empresta a foto não impede a campanha de ser excluída.
  it('a exclusão acontece mesmo quando nada há para apagar no disco', async () => {
    const { uc, armazenamento, repositorio } = montar(
      catalogo({
        referencias: [],
        fotos: [{ arquivoId: 'produtos/CO26217/abc.jpg' }],
        finalArquivoId: null,
      }),
    );

    await uc.execute('cat-1');

    expect(repositorio.remover).toHaveBeenCalledWith('cat-1');
    expect(armazenamento.remover).not.toHaveBeenCalled();
  });

  it('catálogo que não existe não apaga nada', async () => {
    const { uc, armazenamento, repositorio } = montar(null);

    await expect(uc.execute('cat-1')).rejects.toThrow();

    expect(repositorio.remover).not.toHaveBeenCalled();
    expect(armazenamento.remover).not.toHaveBeenCalled();
  });
});
