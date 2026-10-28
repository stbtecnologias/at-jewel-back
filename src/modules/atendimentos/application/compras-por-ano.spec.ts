import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { TETO_DE_LISTA } from '../../../shared/limites/teto-de-lista';

/**
 * A TABELA QUE RESPONDE O PEDIDO INTEIRO — 27/10/2026.
 *
 * ==========================================================================
 *   "Organizar por cliente, em ordem alfabética, mostrando a quantidade de
 *    peças compradas em cada ano, o valor das compras e o total dos dois
 *    anos."
 *
 * Uma chamada, uma tabela, um PDF. Duas chamadas — uma por ano — davam certo
 * na conversa e erradas no arquivo: a segunda tabela escrevia por cima da
 * primeira, e o PDF saía com um ano só.
 * ==========================================================================
 */
function naoParaTudo(nome: string) {
  return new Proxy(
    {},
    {
      get: () => {
        throw new Error(`o teste encostou em ${nome}, e não devia`);
      },
    },
  );
}

const ANA = {
  nome: 'Ana Prado',
  porAno: {
    2025: { pecas: 3, valor: 12000 },
    2026: { pecas: 1, valor: 5000 },
  },
  totalPecas: 4,
  totalValor: 17000,
};

const BEATRIZ = {
  nome: 'Beatriz Lima',
  porAno: { 2026: { pecas: 2, valor: 8000 } },
  totalPecas: 2,
  totalValor: 8000,
};

function montar(opcoes: {
  clientes?: unknown[];
  anos?: number[];
  total?: number;
}) {
  const lista = opcoes.clientes ?? [ANA, BEATRIZ];
  const comprasPorAno = jest.fn().mockResolvedValue({
    clientes: lista,
    anos: opcoes.anos ?? [2025, 2026],
    total: opcoes.total ?? lista.length,
  });
  const relatorio = { guardar: jest.fn(), guardarTexto: jest.fn() };

  const deps = Array.from({ length: 32 }, (_, i) =>
    naoParaTudo(`colaborador ${i}`),
  );
  deps[0] = {
    execute: jest.fn().mockResolvedValue({
      status: 'OK',
      id: 'vd-1',
      nome: 'Ylka',
      codigoErp: 'SEED-VD09',
    }),
  } as never;
  deps[13] = { comprasPorAno } as never;
  deps[23] = relatorio as never;

  const servico = new FerramentasGestaoService(
    ...(deps as unknown as ConstructorParameters<
      typeof FerramentasGestaoService
    >),
  );
  return { servico, comprasPorAno, relatorio };
}

describe('compras por cliente, ano a ano', () => {
  it('a tabela tem duas colunas por ano, mais o total', async () => {
    const { servico, relatorio } = montar({});

    await servico
      .montar({ chaveDaConversa: 'gestao:ad-1' })
      .gestaoClientesPorAno({
        vendedora: 'ylka',
        de: '2025-01-01',
        ate: '2026-12-31',
      });

    const tabela = relatorio.guardar.mock.calls[0][1];
    expect(tabela.colunas.map((c: { titulo: string }) => c.titulo)).toEqual([
      'Cliente',
      'Peças 2025',
      'Valor 2025',
      'Peças 2026',
      'Valor 2026',
      'Total',
    ]);
    // Seis colunas: a folha vai deitada, que é a regra da casa.
    expect(tabela.paisagem).toBe(true);
  });

  it('cada linha leva os dois anos e o total dos dois', async () => {
    const { servico, relatorio } = montar({});

    await servico
      .montar({ chaveDaConversa: 'gestao:ad-1' })
      .gestaoClientesPorAno({ vendedora: 'ylka' });

    const [primeira] = relatorio.guardar.mock.calls[0][1].linhas;
    expect(primeira.cliente).toBe('Ana Prado');
    expect(primeira.pecas2025).toBe('3');
    expect(primeira.pecas2026).toBe('1');
    expect(primeira.total).toContain('17.000');
  });

  /* ANO SEM COMPRA É TRAÇO, e não zero: zero afirma que ela comprou zero
   * reais; o traço diz que não houve compra naquele ano. */
  it('ano sem compra sai como traço', async () => {
    const { servico, relatorio } = montar({ clientes: [BEATRIZ] });

    await servico
      .montar({ chaveDaConversa: 'gestao:ad-1' })
      .gestaoClientesPorAno({ vendedora: 'ylka' });

    const [linha] = relatorio.guardar.mock.calls[0][1].linhas;
    expect(linha.pecas2025).toBe('—');
    expect(linha.valor2025).toBe('—');
  });

  it('o rodapé soma cada ano e o total', async () => {
    const { servico, relatorio } = montar({});

    await servico
      .montar({ chaveDaConversa: 'gestao:ad-1' })
      .gestaoClientesPorAno({ vendedora: 'ylka' });

    const rodape = relatorio.guardar.mock.calls[0][1].total;
    expect(rodape.pecas2025).toBe('3');
    expect(rodape.pecas2026).toBe('3');
    expect(rodape.total).toContain('25.000');
  });

  it('a conversa recebe a linha escrita, com os anos separados', async () => {
    const { servico } = montar({});

    const r = await servico.montar({}).gestaoClientesPorAno({
      vendedora: 'ylka',
    });

    // O NBSP do `R$` vira espaço comum para o teste poder ser lido: o
    // formatador da casa separa o símbolo com espaço inquebrável.
    const semNbsp = r.linhas[0].replace(/\u00a0/g, String.fromCharCode(32));
    // COM CENTAVO desde 28/10/2026 — decisão do Lucas, ver `formato/moeda.ts`.
    expect(semNbsp).toBe(
      'Ana Prado — 2025: 3 peças, R$ 12.000,00 · 2026: 1 peça, R$ 5.000,00 · total R$ 17.000,00',
    );
  });

  /* SEM PERÍODO, OS DOIS ÚLTIMOS ANOS — é a pergunta que aparece. */
  it('sem período, a janela começa em 1º de janeiro do ano passado', async () => {
    const { servico, comprasPorAno } = montar({});

    await servico.montar({}).gestaoClientesPorAno({ vendedora: 'ylka' });

    const janela = comprasPorAno.mock.calls[0][1];
    const anoPassado = new Date().getFullYear() - 1;
    expect(janela.de).toEqual(new Date(anoPassado, 0, 1, 0, 0, 0, 0));
    expect(janela.limite).toBe(TETO_DE_LISTA);
  });

  it('a conversa fica com vinte, e o arquivo leva os 64', async () => {
    const muitos = Array.from({ length: 64 }, (_, i) => ({
      ...ANA,
      nome: `Cliente ${i}`,
    }));
    const { servico, relatorio } = montar({ clientes: muitos });

    const r = await servico
      .montar({ chaveDaConversa: 'gestao:ad-1' })
      .gestaoClientesPorAno({ vendedora: 'ylka' });

    expect(r.linhas).toHaveLength(20);
    expect(relatorio.guardar.mock.calls[0][1].linhas).toHaveLength(64);
  });

  it('o título diz de quem e de quando', async () => {
    const { servico, relatorio } = montar({});

    await servico
      .montar({ chaveDaConversa: 'gestao:ad-1' })
      .gestaoClientesPorAno({
        vendedora: 'ylka',
        de: '2025-01-01',
        ate: '2026-12-31',
      });

    expect(relatorio.guardar.mock.calls[0][1].titulo).toBe(
      'Compras por cliente — Ylka · 2025 a 2026',
    );
  });
});
