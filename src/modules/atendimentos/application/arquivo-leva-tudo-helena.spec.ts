import { FerramentasVendedoraService } from './ferramentas-vendedora.service';
import { TETO_DE_LISTA } from '../../../shared/limites/teto-de-lista';

/**
 * ==========================================================================
 * O ARQUIVO DA HELENA LEVAVA A PÁGINA, E NÃO A LISTA — 28/10/2026.
 *
 * *"Isso de todas as consultas, tanto Helena como Anastasia."* — Lucas.
 *
 * O trabalho de 23/10 e 27/10 — a consulta pedir o teto do arquivo e a tabela
 * guardar a lista inteira — foi feito só do lado da GESTÃO. Medido na maior
 * carteira da casa, antes do conserto:
 *
 *   Helena,    "clientes sem comprar":   20 de 127
 *   Anastasia, a mesma consulta:        127 de 127
 *
 * E a causa eram DUAS, somadas. Os handlers dela não pediam limite, então
 * pegavam o padrão de vinte do caso de uso; e nenhum guardava tabela, então o
 * PDF era montado a partir do TEXTO DA CONVERSA — e um PDF feito do texto da
 * conversa nunca pode ter mais linhas do que a conversa teve.
 *
 * Depois do conserto, medido no mesmo banco:
 *
 *   lista                    conversa   tabela   total
 *   clientes sem comprar           20      127     127
 *   clientes por época             20       37      37
 *   melhores clientes              20      156     156
 *   clientes por fidelidade        20      156     156
 * ==========================================================================
 *
 * O QUE ESTE ARQUIVO PROTEGE: que a consulta do arquivo peça o teto da casa,
 * que a tabela guardada tenha a lista INTEIRA, e que a conversa continue
 * curta. As três coisas juntas — qualquer uma sozinha é um defeito diferente.
 */

const UM_CLIENTE = {
  id: 'c-1',
  nome: 'Cliente A',
  quantidade: 3,
  valorTotal: 12000,
  anos: 2,
  ultimaCompra: new Date('2026-08-12T12:00:00Z'),
};

/** Vinte e cinco clientes: mais que o corte da conversa, menos que o teto. */
const VINTE_E_CINCO = Array.from({ length: 25 }, (_, i) => ({
  ...UM_CLIENTE,
  id: 'c-' + i,
  nome: 'Cliente ' + i,
}));

const FIEL = {
  id: 'c-1',
  nome: 'Cliente A',
  nivel: 'Ouro' as const,
  compras: 9,
  valorLiquido: 1148377,
  ultimaCompra: new Date('2026-08-12T12:00:00Z'),
  vendedoraNome: 'Helena',
};

function montar() {
  const carteira = {
    semComprar: jest.fn().mockResolvedValue({
      clientes: VINTE_E_CINCO,
      total: 127,
      deslocamento: 0,
    }),
    maioresCompradores: jest
      .fn()
      .mockResolvedValue({ clientes: VINTE_E_CINCO, total: 156 }),
    porEpoca: jest
      .fn()
      .mockResolvedValue({ clientes: VINTE_E_CINCO, total: 37 }),
    porFidelidade: jest.fn().mockResolvedValue({
      clientes: Array.from({ length: 25 }, (_, i) => ({
        ...FIEL,
        id: 'f-' + i,
        nome: 'Cliente ' + i,
      })),
      total: 156,
      deslocamento: 0,
      semVendedora: 0,
    }),
  };
  const relatorio = { guardar: jest.fn(), pegar: jest.fn() };

  const servico = new FerramentasVendedoraService(
    { execute: jest.fn() } as never,
    { vendas: jest.fn(), metas: jest.fn() } as never,
    { execute: jest.fn() } as never,
    carteira as never,
    { execute: jest.fn() } as never,
    { execute: jest.fn() } as never,
    { resumo: jest.fn(), listar: jest.fn() } as never,
    { listarPorVendedora: jest.fn().mockResolvedValue([]) } as never,
    { execute: jest.fn() } as never,
    { pecasPorFaixa: jest.fn() } as never,
    relatorio as never,
    { montar: jest.fn().mockResolvedValue('dossie') } as never,
  );

  const ferramentas = servico.montar({
    vendedoraId: 'vd-1',
    codigoErp: 'SEED-VD01',
    chaveDaConversa: 'interna:vd-1',
  });
  return { ferramentas, carteira, relatorio };
}

/** A tabela guardada na última chamada. */
const tabela = (relatorio: { guardar: jest.Mock }) =>
  relatorio.guardar.mock.calls[0][1] as {
    titulo: string;
    linhas: Record<string, string>[];
    colunas: { chave: string }[];
    exibindo?: { mostradas: number; total: number };
  };

describe('as listas da Helena: o arquivo leva tudo', () => {
  /* ESTE É O TESTE — clientes sem comprar, o caso que foi medido. */
  it('clientes sem comprar: duas consultas, e a do arquivo pede o teto', async () => {
    const { ferramentas, carteira, relatorio } = montar();

    const r = await ferramentas.clientesSemComprar({ meses: 6 });

    // A da conversa respeita a página pedida; a do arquivo começa do princípio.
    expect(carteira.semComprar).toHaveBeenCalledTimes(2);
    expect(carteira.semComprar).toHaveBeenCalledWith(
      'SEED-VD01',
      expect.any(Date),
      undefined,
    );
    expect(carteira.semComprar).toHaveBeenCalledWith(
      'SEED-VD01',
      expect.any(Date),
      0,
      TETO_DE_LISTA,
    );
    expect(tabela(relatorio).linhas).toHaveLength(25);
    expect(tabela(relatorio).exibindo).toEqual({ mostradas: 25, total: 127 });
    // A CONVERSA NÃO MUDA: ela recebe o que a página trouxe.
    expect(r.clientes).toHaveLength(25);
  });

  it('clientes por época: a consulta pede o teto, e a conversa fica com vinte', async () => {
    const { ferramentas, carteira, relatorio } = montar();

    const r = await ferramentas.clientesPorEpoca({ mes: 12 });

    expect(carteira.porEpoca.mock.calls[0][2]).toBe(TETO_DE_LISTA);
    expect(tabela(relatorio).linhas).toHaveLength(25);
    // ESTA LEITURA NUNCA CORTOU, e passaria a mandar a lista inteira para o
    // modelo quando a consulta deixou de limitar. Vinte é o que ela já tinha.
    expect(r.clientes).toHaveLength(20);
  });

  it('melhores clientes: idem — tabela inteira, conversa de vinte', async () => {
    const { ferramentas, carteira, relatorio } = montar();

    const r = await ferramentas.melhoresClientes({});

    expect(carteira.maioresCompradores.mock.calls[0][1]).toMatchObject({
      limite: TETO_DE_LISTA,
    });
    expect(tabela(relatorio).linhas).toHaveLength(25);
    expect(r.clientes).toHaveLength(20);
  });

  it('fidelidade: duas consultas, e a tabela é a do arquivo', async () => {
    const { ferramentas, carteira, relatorio } = montar();

    const r = await ferramentas.clientesPorFidelidade({});

    expect(carteira.porFidelidade).toHaveBeenCalledTimes(2);
    expect(carteira.porFidelidade.mock.calls[1][0]).toMatchObject({
      limite: TETO_DE_LISTA,
      deslocamento: 0,
    });
    expect(tabela(relatorio).linhas).toHaveLength(25);
    expect(r.linhas).toHaveLength(25);
  });

  /**
   * A COLUNA DA VENDEDORA NÃO ENTRA NA TABELA DELA.
   *
   * A da gestão tem seis colunas, e a sexta diz de quem é a carteira. Numa
   * carteira própria isso repetiria o mesmo nome em todas as linhas — e são
   * as cinco colunas que fazem a folha caber em retrato.
   */
  it('a tabela de fidelidade dela não traz a coluna "Vendedora"', async () => {
    const { ferramentas, relatorio } = montar();

    await ferramentas.clientesPorFidelidade({});

    const chaves = tabela(relatorio).colunas.map((c) => c.chave);
    expect(chaves).toEqual(['cliente', 'nivel', 'compras', 'valor', 'ultima']);
  });

  it('sem chave de conversa não guarda nada — no painel a tabela já está na tela', async () => {
    const { carteira, relatorio } = montar();
    const servico = new FerramentasVendedoraService(
      { execute: jest.fn() } as never,
      { vendas: jest.fn(), metas: jest.fn() } as never,
      { execute: jest.fn() } as never,
      carteira as never,
      { execute: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { resumo: jest.fn(), listar: jest.fn() } as never,
      { listarPorVendedora: jest.fn().mockResolvedValue([]) } as never,
      { execute: jest.fn() } as never,
      { pecasPorFaixa: jest.fn() } as never,
      relatorio as never,
      { montar: jest.fn() } as never,
    );

    await servico
      .montar({ vendedoraId: 'vd-1', codigoErp: 'SEED-VD01' })
      .melhoresClientes({});

    // O `guardar` é chamado, e é o serviço que ignora a chave nula — o mesmo
    // desenho da gestão. O que não pode é estourar.
    expect(relatorio.guardar).toHaveBeenCalledWith(
      undefined,
      expect.anything(),
    );
  });
});
