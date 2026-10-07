import { FotosDeProdutoService } from './fotos-de-produto.service';

/**
 * ==========================================================================
 * A URL EXISTE; A FOTO, QUASE NUNCA — medido em 07/10/2026.
 *
 * Baixei as 546 peças com saldo, uma a uma, direto da Conexa:
 *
 *              tem foto   404   sem URL
 *   JEWEL          55     192      73     (17%)
 *   HOME          138      44      28     (66%)
 *   total         196     245     105     (36%)
 *
 * Por isso o 404 aqui é CAMINHO FELIZ, e não exceção: é o caso comum. Nada
 * neste serviço pode lançar, porque a resposta da agente não depende da foto.
 *
 * E o 404 da Conexa vem com PÁGINA HTML. Confiar só no status, ou só no
 * tipo, mandaria 4.900 bytes de HTML para o WhatsApp como se fossem imagem.
 * ==========================================================================
 */

type Resposta = { ok: boolean; status: number; tipo: string; corpo: string };

function conexaQueResponde(mapa: Record<string, Resposta>) {
  return jest.fn(async (url: string) => {
    const r = mapa[url];
    if (!r) throw new Error('fetch failed');
    return {
      ok: r.ok,
      status: r.status,
      headers: { get: (h: string) => (h === 'content-type' ? r.tipo : null) },
      arrayBuffer: async () => Buffer.from(r.corpo),
    } as never;
  });
}

const imagem = (corpo = 'PNGPNGPNG'): Resposta => ({
  ok: true,
  status: 200,
  tipo: 'image/png',
  corpo,
});

const naoAchou: Resposta = {
  ok: false,
  status: 404,
  tipo: 'text/html; charset=utf-8',
  corpo: '<!DOCTYPE html><html>404</html>',
};

describe('FotosDeProdutoService', () => {
  let servico: FotosDeProdutoService;
  const original = global.fetch;

  beforeEach(() => {
    servico = new FotosDeProdutoService();
  });

  afterEach(() => {
    global.fetch = original;
  });

  const pedido = (codigo: string, url: string | null = `http://conexa/${codigo}.png`) => ({
    codigo,
    url,
    legenda: `Peça ${codigo}`,
  });

  it('traz a foto que existe', async () => {
    global.fetch = conexaQueResponde({ 'http://conexa/AN22083.png': imagem() });

    const r = await servico.buscar([pedido('AN22083')]);

    expect(r.fotos).toHaveLength(1);
    expect(r.fotos[0].codigo).toBe('AN22083');
    expect(r.fotos[0].mime).toBe('image/png');
    expect(r.tinhamUrl).toBe(1);
  });

  /* ESTE É O TESTE. O resto é contorno. */
  it('o 404 com página HTML não vira imagem', async () => {
    global.fetch = conexaQueResponde({ 'http://conexa/PI25065.png': naoAchou });

    const r = await servico.buscar([pedido('PI25065')]);

    expect(r.fotos).toHaveLength(0);
    // E não lançou: a resposta da agente sai com texto, sem foto.
  });

  /**
   * Um 200 com HTML também acontece quando um proxy se mete no caminho. O
   * tipo manda tanto quanto o status.
   */
  it('200 com HTML também não vira imagem', async () => {
    global.fetch = conexaQueResponde({
      'http://conexa/X1.png': { ok: true, status: 200, tipo: 'text/html', corpo: '<html>' },
    });

    const r = await servico.buscar([pedido('X1')]);

    expect(r.fotos).toHaveLength(0);
  });

  it('peça sem URL nem é procurada', async () => {
    const fetchFalso = conexaQueResponde({});
    global.fetch = fetchFalso;

    const r = await servico.buscar([pedido('CO26307', null)]);

    expect(fetchFalso).not.toHaveBeenCalled();
    expect(r.tinhamUrl).toBe(0);
  });

  it('rede caída não derruba a resposta', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as never;

    const r = await servico.buscar([pedido('AN1'), pedido('AN2')]);

    expect(r.fotos).toHaveLength(0);
  });

  /**
   * Dez fotos de 156 KB viram dez mensagens para quem pediu uma tabela. O
   * teto corta — e `cortadas` existe para o texto poder DIZER que cortou.
   */
  it('corta no teto de cinco, e diz quantas ficaram', async () => {
    const mapa: Record<string, Resposta> = {};
    const pedidos = [];
    for (let i = 1; i <= 8; i += 1) {
      mapa[`http://conexa/P${i}.png`] = imagem();
      pedidos.push(pedido(`P${i}`));
    }
    global.fetch = conexaQueResponde(mapa);

    const r = await servico.buscar(pedidos);

    expect(r.fotos).toHaveLength(5);
    expect(r.cortadas).toBe(3);
    expect(r.tinhamUrl).toBe(8);
  });

  /**
   * As fotos são baixadas em paralelo, então chegam fora de ordem. A legenda
   * tem de casar com a ordem do texto que a agente acabou de escrever.
   */
  it('devolve na ordem da lista, não na ordem de chegada', async () => {
    global.fetch = conexaQueResponde({
      'http://conexa/A.png': imagem('a'),
      'http://conexa/B.png': imagem('b'),
      'http://conexa/C.png': imagem('c'),
    });

    const r = await servico.buscar([pedido('A'), pedido('B'), pedido('C')]);

    expect(r.fotos.map((f) => f.codigo)).toEqual(['A', 'B', 'C']);
  });

  it('a legenda da peça acompanha a foto', async () => {
    global.fetch = conexaQueResponde({ 'http://conexa/AN1.png': imagem() });

    const r = await servico.buscar([pedido('AN1')]);

    expect(r.fotos[0].legenda).toBe('Peça AN1');
  });
});
