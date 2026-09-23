import { EstiloDoCatalogoService } from './estilo-do-catalogo.service';
import type { DirecaoDeArte } from '../domain/ports/estilo-catalogo.port';
import type { ReferenciaItem } from '../domain/ports/repositories/catalogo-repository.port';

/**
 * A DIRECAO DE ARTE DO CATALOGO — 15 e 16/09/2026.
 *
 * O que estes testes protegem:
 *
 * 1. SEM OBSERVACAO NAO HA TEMA. "Sem observacao voce deixa branco mesmo" — e
 *    nem as paginas de referencia sozinhas ligam o tema.
 * 2. COM OBSERVACAO HA TEMA SEMPRE, mesmo com o provedor fora do ar: a cena e
 *    o texto escrito, a paleta e a da casa.
 * 3. LE UMA VEZ POR CATALOGO, e trocar pagina ou texto faz reler.
 */
const PAGINA = (
  id: string,
  arquivo: string,
  observacao: string | null = null,
) =>
  ({
    id,
    tipo: 'IMAGEM',
    valor: 'pagina',
    arquivoId: arquivo,
    mime: 'image/jpeg',
    observacao,
  }) as ReferenciaItem;

const OBS = (valor: string) =>
  ({
    id: 't-1',
    tipo: 'OBSERVACAO',
    valor,
    arquivoId: null,
    mime: null,
    observacao: null,
  }) as ReferenciaItem;

const LIDA: DirecaoDeArte = {
  cena: 'praia ao fim da tarde, areia clara',
  modelo: 'uma mulher elegante',
  paleta: { fundo: '#f4ece0', destaque: '#2a9d8f', texto: '#1d3557' },
  frase: 'Dias de sol',
};

describe('EstiloDoCatalogoService', () => {
  let leitor: { disponivel: jest.Mock; ler: jest.Mock };
  let armazenamento: { ler: jest.Mock };
  let servico: EstiloDoCatalogoService;

  beforeEach(() => {
    leitor = {
      disponivel: jest.fn(() => true),
      ler: jest.fn().mockResolvedValue(LIDA),
    };
    armazenamento = {
      ler: jest.fn().mockResolvedValue({
        conteudo: Buffer.from('jpg'),
        mime: 'image/jpeg',
      }),
    };
    servico = new EstiloDoCatalogoService(leitor, armazenamento as never);
  });

  it('sem observacao, NAO ha tema — nem com pagina de referencia', async () => {
    expect(await servico.direcao('cat-1', [])).toBeNull();
    expect(
      await servico.direcao('cat-1', [PAGINA('r-1', 'ref/a.jpg')]),
    ).toBeNull();
    expect(leitor.ler).not.toHaveBeenCalled();
  });

  it('com observacao, le as paginas junto e devolve a direcao', async () => {
    const direcao = await servico.direcao('cat-1', [
      PAGINA('r-1', 'ref/a.jpg'),
      OBS('tema praiano, férias'),
    ]);

    expect(direcao).toEqual(LIDA);
    const [imagens, texto] = leitor.ler.mock.calls[0] as [unknown[], string];
    expect(imagens).toHaveLength(1);
    expect(texto).toBe('tema praiano, férias');
  });

  it('a observacao anotada NA PAGINA tambem liga o tema', async () => {
    const direcao = await servico.direcao('cat-1', [
      PAGINA('r-1', 'ref/a.jpg', 'quero esse clima de verao'),
    ]);

    expect(direcao).toEqual(LIDA);
    const [, texto] = leitor.ler.mock.calls[0] as [unknown[], string];
    expect(texto).toBe('quero esse clima de verao');
  });

  it('observacao sem pagina tambem vale — o texto basta', async () => {
    await servico.direcao('cat-1', [OBS('tema praiano')]);

    const [imagens] = leitor.ler.mock.calls[0] as [unknown[]];
    expect(imagens).toHaveLength(0);
  });

  it('provedor que falha nao apaga o tema: a cena e o texto escrito', async () => {
    leitor.ler.mockResolvedValue(null);

    const direcao = await servico.direcao('cat-1', [OBS('tema praiano')]);

    expect(direcao).toEqual({
      cena: 'tema praiano',
      modelo: 'uma mulher elegante',
      paleta: { fundo: '#ffffff', destaque: '#b8912f', texto: '#1a1a1a' },
      frase: null,
    });
  });

  it('sem chave configurada, o tema sai do texto sem tentar ler', async () => {
    leitor.disponivel.mockReturnValue(false);

    const direcao = await servico.direcao('cat-1', [OBS('tema praiano')]);

    expect(direcao?.cena).toBe('tema praiano');
    expect(leitor.ler).not.toHaveBeenCalled();
  });

  it('montar de novo NAO paga outra leitura', async () => {
    const refs = [OBS('tema praiano')];

    await servico.direcao('cat-1', refs);
    await servico.direcao('cat-1', refs);

    expect(leitor.ler).toHaveBeenCalledTimes(1);
  });

  it('mudar o texto ou a pagina faz reler', async () => {
    await servico.direcao('cat-1', [OBS('tema praiano')]);
    await servico.direcao('cat-1', [OBS('tema natalino')]);
    await servico.direcao('cat-1', [
      OBS('tema natalino'),
      PAGINA('r-2', 'ref/b.jpg'),
    ]);

    expect(leitor.ler).toHaveBeenCalledTimes(3);
  });

  it('falha nao vai para o cache — a proxima montagem tenta de novo', async () => {
    leitor.ler.mockResolvedValueOnce(null).mockResolvedValueOnce(LIDA);
    const refs = [OBS('tema praiano')];

    await servico.direcao('cat-1', refs);
    expect(await servico.direcao('cat-1', refs)).toEqual(LIDA);
  });

  it('PDF de referencia nao entra na leitura', async () => {
    const pdf = {
      ...PAGINA('r-1', 'ref/a.pdf'),
      mime: 'application/pdf',
    } as ReferenciaItem;

    await servico.direcao('cat-1', [pdf, OBS('tema praiano')]);

    expect(armazenamento.ler).not.toHaveBeenCalled();
  });

  it('arquivo que sumiu do bucket nao derruba a leitura', async () => {
    armazenamento.ler.mockResolvedValueOnce(null);

    const direcao = await servico.direcao('cat-1', [
      PAGINA('r-1', 'ref/sumiu.jpg'),
      PAGINA('r-2', 'ref/b.jpg'),
      OBS('tema praiano'),
    ]);

    expect(direcao).toEqual(LIDA);
    const [imagens] = leitor.ler.mock.calls[0] as [unknown[]];
    expect(imagens).toHaveLength(1);
  });
});
