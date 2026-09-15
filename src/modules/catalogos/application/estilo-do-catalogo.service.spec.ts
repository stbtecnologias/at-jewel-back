import { EstiloDoCatalogoService } from './estilo-do-catalogo.service';
import type { ReferenciaItem } from '../domain/ports/repositories/catalogo-repository.port';

/**
 * A LEITURA DAS PAGINAS DE REFERENCIA — 15/09/2026.
 *
 * O que estes testes protegem:
 *
 * 1. LE UMA VEZ POR CATALOGO. Quem fotografa manda 20 pecas na mesma tarde, e
 *    as paginas sao as mesmas nas 20.
 * 2. TROCAR A REFERENCIA INVALIDA O QUE FOI LIDO. Sem isso, o marketing troca
 *    a pagina no painel e o sistema segue com a antiga ate alguem reiniciar.
 * 3. NUNCA QUEBRA. Sem pagina, sem chave ou com o provedor fora do ar, a
 *    resposta e `null` e o tratamento segue com os textos, como antes.
 */
const PAGINA = (id: string, arquivo: string): ReferenciaItem =>
  ({
    id,
    tipo: 'IMAGEM',
    valor: 'pagina',
    arquivoId: arquivo,
    mime: 'image/jpeg',
  }) as ReferenciaItem;

const TEXTO = (valor: string): ReferenciaItem =>
  ({
    id: 't-1',
    tipo: 'OBSERVACAO',
    valor,
    arquivoId: null,
    mime: null,
  }) as ReferenciaItem;

describe('EstiloDoCatalogoService', () => {
  let leitor: { disponivel: jest.Mock; ler: jest.Mock };
  let armazenamento: { ler: jest.Mock };
  let servico: EstiloDoCatalogoService;

  beforeEach(() => {
    leitor = {
      disponivel: jest.fn(() => true),
      ler: jest.fn().mockResolvedValue('fundo bege claro, luz quente'),
    };
    armazenamento = {
      ler: jest.fn().mockResolvedValue({
        conteudo: Buffer.from('jpg'),
        mime: 'image/jpeg',
      }),
    };
    servico = new EstiloDoCatalogoService(leitor, armazenamento as never);
  });

  it('le as paginas e devolve o estilo escrito', async () => {
    const estilo = await servico.ler(
      'cat-1',
      [PAGINA('r-1', 'ref/a.jpg'), TEXTO('tema praiano')],
      'observacao: tema praiano',
    );

    expect(estilo).toBe('fundo bege claro, luz quente');
    // O TEXTO DO MARKETING VAI JUNTO: o modelo casa o que le com o que ve.
    const [imagens, texto] = leitor.ler.mock.calls[0] as [
      { conteudo: Buffer; mime: string }[],
      string,
    ];
    expect(imagens).toHaveLength(1);
    expect(imagens[0].mime).toBe('image/jpeg');
    expect(texto).toBe('observacao: tema praiano');
  });

  it('a segunda foto do mesmo catalogo NAO paga outra leitura', async () => {
    const refs = [PAGINA('r-1', 'ref/a.jpg')];

    await servico.ler('cat-1', refs, null);
    await servico.ler('cat-1', refs, null);
    await servico.ler('cat-1', refs, null);

    expect(leitor.ler).toHaveBeenCalledTimes(1);
  });

  it('trocar a pagina de referencia faz reler', async () => {
    await servico.ler('cat-1', [PAGINA('r-1', 'ref/a.jpg')], null);
    await servico.ler('cat-1', [PAGINA('r-2', 'ref/b.jpg')], null);

    expect(leitor.ler).toHaveBeenCalledTimes(2);
  });

  it('mudar o texto do marketing tambem faz reler', async () => {
    const refs = [PAGINA('r-1', 'ref/a.jpg')];

    await servico.ler('cat-1', refs, 'observacao: tema praiano');
    await servico.ler('cat-1', refs, 'observacao: tema natalino');

    expect(leitor.ler).toHaveBeenCalledTimes(2);
  });

  it('sem pagina de imagem, nao chama o provedor', async () => {
    const estilo = await servico.ler('cat-1', [TEXTO('tema praiano')], null);

    expect(estilo).toBeNull();
    expect(leitor.ler).not.toHaveBeenCalled();
  });

  it('PDF de referencia nao entra na leitura', async () => {
    // Ele vira cartao de arquivo na tela; o modelo le imagem.
    const pdf = {
      ...PAGINA('r-1', 'ref/a.pdf'),
      mime: 'application/pdf',
    } as ReferenciaItem;

    expect(await servico.ler('cat-1', [pdf], null)).toBeNull();
    expect(leitor.ler).not.toHaveBeenCalled();
  });

  it('sem chave configurada, devolve null sem tentar', async () => {
    leitor.disponivel.mockReturnValue(false);

    expect(
      await servico.ler('cat-1', [PAGINA('r-1', 'ref/a.jpg')], null),
    ).toBeNull();
    expect(armazenamento.ler).not.toHaveBeenCalled();
  });

  it('arquivo que sumiu do disco nao derruba a leitura', async () => {
    armazenamento.ler.mockResolvedValueOnce(null).mockResolvedValueOnce({
      conteudo: Buffer.from('jpg'),
      mime: 'image/jpeg',
    });

    const estilo = await servico.ler(
      'cat-1',
      [PAGINA('r-1', 'ref/sumiu.jpg'), PAGINA('r-2', 'ref/b.jpg')],
      null,
    );

    expect(estilo).toBe('fundo bege claro, luz quente');
    const [imagens] = leitor.ler.mock.calls[0] as [unknown[]];
    expect(imagens).toHaveLength(1);
  });

  it('esquecer forca a proxima leitura', async () => {
    const refs = [PAGINA('r-1', 'ref/a.jpg')];

    await servico.ler('cat-1', refs, null);
    servico.esquecer('cat-1');
    await servico.ler('cat-1', refs, null);

    expect(leitor.ler).toHaveBeenCalledTimes(2);
  });

  it('provedor que falha nao vira excecao — e o estilo fica null', async () => {
    leitor.ler.mockResolvedValue(null);

    expect(
      await servico.ler('cat-1', [PAGINA('r-1', 'ref/a.jpg')], null),
    ).toBeNull();
  });
});
