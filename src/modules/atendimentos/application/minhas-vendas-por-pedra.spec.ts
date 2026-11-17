import { FerramentasVendedoraService } from './ferramentas-vendedora.service';
import { moeda } from '../../../shared/formato/moeda';

/**
 * AS QUEBRAS DA PRÓPRIA VENDEDORA — 17/11/2026.
 *
 * ==========================================================================
 * "QUANTAS PÉROLAS VENDI?"
 *
 * O Lucas corrigiu o roteiro de teste: *"no caso das vendedoras elas podem
 * saber no caso delas mesmas… no lugar de 'quem vendeu mais pérola esse mês?'
 * seria 'quantas pérolas vendi?', 'quantos diamantes vendi?', 'quantas pedras
 * eu vendi?', 'e em comparação do ano passado?'"*.
 *
 * UMA FERRAMENTA RESPONDE AS QUATRO, porque a quebra vem inteira e ela lê a
 * linha — a mesma decisão do caminho A, pagando de novo.
 *
 * O ESCOPO VEM DO CONTEXTO, NUNCA DO QUE ELA DIGITAR. Nenhuma das três tem
 * campo "de quem", então não há o que o modelo preencha errado: é o mesmo
 * desenho do `minhas_pecas_por_valor` e dos lembretes.
 * ==========================================================================
 */
const EU = 'vd-1';

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

function montar(metodo: string, resposta: unknown) {
  const consulta = jest.fn().mockResolvedValue(resposta);

  const deps = Array.from({ length: 16 }, (_, i) =>
    naoParaTudo(`colaborador ${i}`),
  );
  // O `ConsultarVendasUseCase` e o DECIMO parametro do construtor.
  deps[9] = { [metodo]: consulta } as never;

  const servico = new FerramentasVendedoraService(
    ...(deps as unknown as ConstructorParameters<
      typeof FerramentasVendedoraService
    >),
  );
  return {
    ferramentas: servico.montar({ vendedoraId: EU, codigoErp: '003' }),
    consulta,
  };
}

describe('as minhas vendas por pedra', () => {
  const QUEBRA = {
    linhas: [
      { pedra: 'Diamante', quantidade: 83, valor: 3204451.22, quantidadeAnterior: 0 },
      { pedra: 'Perola', quantidade: 3, valor: 33545.76, quantidadeAnterior: 0 },
    ],
    pecasComPedra: 86,
    pecasSemPedra: 28,
    comparando: false,
    ano: '2026',
    anoAnterior: null,
    periodo: 'de 01/01/2026 a 17/11/2026',
  };

  it('devolve a quebra dela, com a linha pronta', async () => {
    const { ferramentas } = montar('porPedra', QUEBRA);

    const r = await ferramentas.minhasVendasPorPedra({});

    expect(r.status).toBe('OK');
    expect(r.linhas).toEqual([
      `Diamante: 83 peças — ${moeda(3204451.22)}`,
      `Perola: 3 peças — ${moeda(33545.76)}`,
    ]);
  });

  /**
   * O CAMPO QUE IMPEDE O VAZAMENTO. Se a resposta não disser de quem é, o
   * modelo decide — e já decidiu errado uma vez, inventando "em 2026" numa
   * resposta vazia.
   */
  it('a resposta diz que o número é dela', async () => {
    const { ferramentas } = montar('porPedra', QUEBRA);

    const r = await ferramentas.minhasVendasPorPedra({});

    expect(r.escopo).toBe('VENDEDORA');
  });

  /** O recorte é o id DELA, e ele é o sétimo argumento do caso de uso. */
  it('consulta apenas as vendas dela', async () => {
    const { ferramentas, consulta } = montar('porPedra', QUEBRA);

    await ferramentas.minhasVendasPorPedra({ periodo: 'ANO' });

    expect(consulta.mock.calls[0][5]).toEqual([EU]);
  });

  it('o pedido de comparação chega ao caso de uso', async () => {
    const { ferramentas, consulta } = montar('porPedra', QUEBRA);

    await ferramentas.minhasVendasPorPedra({ compararAnoAnterior: true });

    expect(consulta.mock.calls[0][3]).toBe(true);
  });

  it('a nota das peças com pedra viaja junto', async () => {
    const { ferramentas } = montar('porPedra', QUEBRA);

    const r = await ferramentas.minhasVendasPorPedra({});

    expect(r.nota).toContain('86');
    expect(r.nota).toContain('conta nas duas');
  });

  it('período sem pedra nenhuma devolve OK com a lista vazia', async () => {
    const { ferramentas } = montar('porPedra', {
      ...QUEBRA,
      linhas: [],
      pecasComPedra: 0,
    });

    const r = await ferramentas.minhasVendasPorPedra({ periodo: 'HOJE' });

    expect(r.status).toBe('OK');
    expect(r.linhas).toEqual([]);
    expect(r.nota).toBeNull();
  });
});

describe('as minhas vendas por tipo de peça', () => {
  const QUEBRA = {
    linhas: [
      { tipo: 'Colar', quantidade: 31, valor: 1535807, quantidadeAnterior: 0, joia: true },
      { tipo: 'Vaso', quantidade: 2, valor: 400, quantidadeAnterior: 0, joia: false },
    ],
    totalDeJoia: 31,
    totalDeJoiaAnterior: 0,
    comparando: false,
    ano: '2026',
    anoAnterior: null,
    periodo: 'de 01/01/2026 a 17/11/2026',
  };

  it('a joia fica na lista e o resto no rodapé, como na da gestão', async () => {
    const { ferramentas } = montar('porTipo', QUEBRA);

    const r = await ferramentas.minhasVendasPorTipo({});

    expect(r.linhas).toEqual([`Colar: 31 peças — ${moeda(1535807)}`]);
    expect(r.foraDaJoia).toEqual([`Vaso: 2 peças — ${moeda(400)}`]);
    expect(r.total).toBe('Total de joia: 31 peças');
    expect(r.escopo).toBe('VENDEDORA');
  });

  it('consulta apenas as vendas dela', async () => {
    const { ferramentas, consulta } = montar('porTipo', QUEBRA);

    await ferramentas.minhasVendasPorTipo({});

    expect(consulta.mock.calls[0][5]).toEqual([EU]);
  });
});

describe('as minhas vendas por metal', () => {
  const QUEBRA = {
    linhas: [{ metal: 'Ouro branco', quantidade: 56, valor: 2604780 }],
    periodo: 'de 01/01/2026 a 17/11/2026',
  };

  it('devolve a quebra dela e diz que é dela', async () => {
    const { ferramentas } = montar('porMetal', QUEBRA);

    const r = await ferramentas.minhasVendasPorMetal({});

    expect(r.linhas).toEqual([`Ouro branco: 56 peças — ${moeda(2604780)}`]);
    expect(r.escopo).toBe('VENDEDORA');
  });

  /** O `porMetal` tem o recorte no QUINTO argumento — ele não compara anos. */
  it('consulta apenas as vendas dela', async () => {
    const { ferramentas, consulta } = montar('porMetal', QUEBRA);

    await ferramentas.minhasVendasPorMetal({ periodo: 'ANO' });

    expect(consulta.mock.calls[0][4]).toEqual([EU]);
  });
});
