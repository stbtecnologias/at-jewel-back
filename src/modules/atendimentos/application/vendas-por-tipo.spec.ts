import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { moeda } from '../../../shared/formato/moeda';

/**
 * A QUEBRA POR TIPO DE PEÇA E POR PEDRA, NA FERRAMENTA — 16/11/2026.
 *
 * ==========================================================================
 * "FORAM VENDIDOS 20 COLARES, 30 ANÉIS…"
 *
 * É a forma que o Lucas descreveu em 16/11, depois de a gestora pedir *"por
 * quantidade de peças"* e receber a lista de 60 itens ordenada por valor.
 *
 * A QUANTIDADE VEM PRIMEIRO E O VALOR DEPOIS, porque foi quantidade que ela
 * pediu. E o total de joia sai calculado daqui, para o modelo não somar.
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

function montar(
  resposta: unknown,
  metodo: 'porTipo' | 'porPedra' | 'quemVendeuPedra' = 'porTipo',
) {
  const consulta = jest.fn().mockResolvedValue(resposta);

  const deps = Array.from({ length: 32 }, (_, i) =>
    naoParaTudo(`colaborador ${i}`),
  );
  // O `consultarVendas` e o SEGUNDO parametro do construtor.
  deps[1] = { [metodo]: consulta } as never;

  const servico = new FerramentasGestaoService(
    ...(deps as unknown as ConstructorParameters<
      typeof FerramentasGestaoService
    >),
  );
  return { servico, consulta };
}

const tipo = (p: Partial<Record<string, unknown>>) => ({
  tipo: 'Colar',
  quantidade: 0,
  valor: 0,
  quantidadeAnterior: 0,
  joia: true,
  ...p,
});

describe('vendas por tipo de peça', () => {
  it('sem comparação, a linha traz a quantidade e depois o valor', async () => {
    const { servico } = montar({
      linhas: [
        tipo({ tipo: 'Colar', quantidade: 118, valor: 6718994.16 }),
        tipo({ tipo: 'Brinco', quantidade: 91, valor: 3395987.93 }),
      ],
      totalDeJoia: 209,
      totalDeJoiaAnterior: 0,
      comparando: false,
      ano: '2026',
      anoAnterior: null,
      periodo: 'de 01/01/2026 a 16/11/2026',
    });

    const r = await servico.montar({ verLoja: true }).gestaoPorTipo({});

    expect(r.status).toBe('OK');
    expect(r.linhas).toEqual([
      `Colar: 118 peças — ${moeda(6718994.16)}`,
      `Brinco: 91 peças — ${moeda(3395987.93)}`,
    ]);
    expect(r.total).toBe('Total de joia: 209 peças');
  });

  it('uma peça sai no singular', async () => {
    const { servico } = montar({
      linhas: [tipo({ tipo: 'Tornozeleira', quantidade: 1, valor: 1999 })],
      totalDeJoia: 1,
      totalDeJoiaAnterior: 0,
      comparando: false,
      ano: '2026',
      anoAnterior: null,
      periodo: 'de 01/01/2026 a 16/11/2026',
    });

    const r = await servico.montar({ verLoja: true }).gestaoPorTipo({});

    expect(r.linhas).toEqual([`Tornozeleira: 1 peça — ${moeda(1999)}`]);
  });

  /**
   * COMPARANDO, O VALOR SAI DA LINHA. A pergunta virou "caiu ou subiu", e
   * três números por linha — atual, anterior e dinheiro — é linha que
   * ninguém lê no WhatsApp.
   */
  it('comparando, a linha traz os dois anos e a diferença', async () => {
    const { servico } = montar({
      linhas: [
        tipo({ tipo: 'Colar', quantidade: 118, quantidadeAnterior: 144 }),
        tipo({ tipo: 'Anel', quantidade: 81, quantidadeAnterior: 123 }),
      ],
      totalDeJoia: 199,
      totalDeJoiaAnterior: 267,
      comparando: true,
      ano: '2026',
      anoAnterior: '2025',
      periodo: 'de 01/01/2026 a 16/11/2026',
    });

    const r = await servico.montar({ verLoja: true }).gestaoPorTipo({
      compararAnoAnterior: true,
    });

    expect(r.linhas).toEqual([
      'Colar: 118 peças em 2026 contra 144 em 2025 — 26 a menos',
      'Anel: 81 peças em 2026 contra 123 em 2025 — 42 a menos',
    ]);
    expect(r.total).toBe(
      'Total de joia: 199 peças em 2026 contra 267 em 2025 — 68 a menos',
    );
  });

  it('subir e empatar também têm frase', async () => {
    const { servico } = montar({
      linhas: [
        tipo({ tipo: 'Pingente', quantidade: 43, quantidadeAnterior: 40 }),
        tipo({ tipo: 'Piercing', quantidade: 23, quantidadeAnterior: 23 }),
        tipo({ tipo: 'Corset', quantidade: 28, quantidadeAnterior: 0, joia: false }),
      ],
      totalDeJoia: 66,
      totalDeJoiaAnterior: 63,
      comparando: true,
      ano: '2026',
      anoAnterior: '2025',
      periodo: 'de 01/01/2026 a 16/11/2026',
    });

    const r = await servico.montar({ verLoja: true }).gestaoPorTipo({
      compararAnoAnterior: true,
    });

    expect(r.linhas).toEqual([
      'Pingente: 43 peças em 2026 contra 40 em 2025 — 3 a mais',
      'Piercing: 23 peças em 2026 contra 23 em 2025 — igual',
    ]);
    expect(r.foraDaJoia).toEqual([
      'Corset: 28 peças em 2026 contra 0 em 2025 — 28 a mais',
    ]);
  });

  /**
   * O QUE NÃO É JOIA SAI DA LISTA PRINCIPAL — numa lista única o corset (28
   * peças) apareceria acima do piercing (23), e a gestora perguntaria por que
   * a loja vende tanto corset.
   */
  it('o que não é joia vai para o rodapé', async () => {
    const { servico } = montar({
      linhas: [
        tipo({ tipo: 'Colar', quantidade: 118, valor: 100 }),
        tipo({ tipo: 'Corset', quantidade: 28, valor: 55, joia: false }),
        tipo({ tipo: 'Vaso', quantidade: 26, valor: 18, joia: false }),
      ],
      totalDeJoia: 118,
      totalDeJoiaAnterior: 0,
      comparando: false,
      ano: '2026',
      anoAnterior: null,
      periodo: 'de 01/01/2026 a 16/11/2026',
    });

    const r = await servico.montar({ verLoja: true }).gestaoPorTipo({});

    expect(r.linhas).toEqual([`Colar: 118 peças — ${moeda(100)}`]);
    expect(r.foraDaJoia).toEqual([
      `Corset: 28 peças — ${moeda(55)}`,
      `Vaso: 26 peças — ${moeda(18)}`,
    ]);
  });

  it('quem não vê a loja não recebe nada, e o banco nem é consultado', async () => {
    const { servico, consulta } = montar({
      linhas: [tipo({ quantidade: 1 })],
      totalDeJoia: 1,
      totalDeJoiaAnterior: 0,
      comparando: false,
      ano: '2026',
      anoAnterior: null,
      periodo: 'de 01/01/2026 a 16/11/2026',
    });

    const r = await servico.montar({}).gestaoPorTipo({});

    expect(r.status).toBe('INDISPONIVEL');
    expect(r.linhas).toEqual([]);
    expect(consulta).not.toHaveBeenCalled();
  });

  it('período sem venda devolve OK com a lista vazia', async () => {
    const { servico } = montar({
      linhas: [],
      totalDeJoia: 0,
      totalDeJoiaAnterior: 0,
      comparando: false,
      ano: null,
      anoAnterior: null,
      periodo: 'o histórico inteiro',
    });

    const r = await servico.montar({ verLoja: true }).gestaoPorTipo({
      periodo: 'HOJE',
    });

    expect(r).toEqual({
      status: 'OK',
      linhas: [],
      total: null,
      foraDaJoia: [],
      periodo: 'o histórico inteiro',
      escopo: 'LOJA',
    });
  });

  it('o período e o pedido de comparação chegam ao caso de uso', async () => {
    const { servico, consulta } = montar({
      linhas: [],
      totalDeJoia: 0,
      totalDeJoiaAnterior: 0,
      comparando: false,
      ano: null,
      anoAnterior: null,
      periodo: 'o histórico inteiro',
    });

    await servico.montar({ verLoja: true }).gestaoPorTipo({
      de: '2026-01-01',
      ate: '2026-11-16',
      compararAnoAnterior: true,
    });

    const [recorte, de, ate, comparar] = consulta.mock.calls[0];
    expect(recorte).toBeUndefined();
    expect(de).toEqual(new Date(2026, 0, 1));
    expect(ate).toEqual(new Date(2026, 10, 16));
    expect(comparar).toBe(true);
  });
});

describe('vendas por pedra', () => {
  it('a linha traz a pedra, a quantidade e o valor', async () => {
    const { servico } = montar(
      {
        linhas: [
          { pedra: 'Diamante', quantidade: 305, valor: 15449907 },
          { pedra: 'Esmeralda', quantidade: 28, valor: 1035873 },
        ],
        pecasComPedra: 337,
        pecasSemPedra: 245,
        comparando: false,
        ano: null,
        anoAnterior: null,
        periodo: 'o histórico inteiro',
      },
      'porPedra',
    );

    const r = await servico.montar({ verLoja: true }).gestaoPorPedra({});

    expect(r.status).toBe('OK');
    expect(r.linhas).toEqual([
      `Diamante: 305 peças — ${moeda(15449907)}`,
      `Esmeralda: 28 peças — ${moeda(1035873)}`,
    ]);
  });

  /**
   * SEM ESTA NOTA A SOMA NÃO FECHA. São 404 contra 337 em 2026: quem somar as
   * linhas e comparar com o total de peças conclui que o número está errado.
   */
  it('a nota explica por que a soma das linhas passa do total', async () => {
    const { servico } = montar(
      {
        linhas: [{ pedra: 'Diamante', quantidade: 305, valor: 1 }],
        pecasComPedra: 337,
        pecasSemPedra: 245,
        comparando: false,
        ano: null,
        anoAnterior: null,
        periodo: 'o histórico inteiro',
      },
      'porPedra',
    );

    const r = await servico.montar({ verLoja: true }).gestaoPorPedra({});

    expect(r.nota).toContain('337');
    expect(r.nota).toContain('conta nas duas');
  });

  it('período sem pedra nenhuma devolve OK com a lista vazia', async () => {
    const { servico } = montar(
      {
        linhas: [],
        pecasComPedra: 0,
        pecasSemPedra: 12,
        comparando: false,
        ano: null,
        anoAnterior: null,
        periodo: 'o histórico inteiro',
      },
      'porPedra',
    );

    const r = await servico.montar({ verLoja: true }).gestaoPorPedra({});

    expect(r).toEqual({
      status: 'OK',
      linhas: [],
      nota: null,
      periodo: 'o histórico inteiro',
      escopo: 'LOJA',
    });
  });

  it('quem não vê a loja não recebe nada', async () => {
    const { servico, consulta } = montar(
      {
        linhas: [{ pedra: 'Diamante', quantidade: 1, valor: 1 }],
        pecasComPedra: 1,
        pecasSemPedra: 0,
        comparando: false,
        ano: null,
        anoAnterior: null,
        periodo: 'o histórico inteiro',
      },
      'porPedra',
    );

    const r = await servico.montar({}).gestaoPorPedra({});

    expect(r.status).toBe('INDISPONIVEL');
    expect(consulta).not.toHaveBeenCalled();
  });
});

describe('pedra comparada entre anos, na ferramenta', () => {
  it('a linha diz os dois anos, como na quebra por tipo', async () => {
    const { servico } = montar(
      {
        linhas: [
          {
            pedra: 'Diamante',
            quantidade: 305,
            valor: 1,
            quantidadeAnterior: 280,
          },
        ],
        pecasComPedra: 337,
        pecasSemPedra: 245,
        comparando: true,
        ano: '2026',
        anoAnterior: '2025',
        periodo: 'de 01/01/2026 a 16/11/2026',
      },
      'porPedra',
    );

    const r = await servico.montar({ verLoja: true }).gestaoPorPedra({
      compararAnoAnterior: true,
    });

    expect(r.linhas).toEqual([
      'Diamante: 305 peças em 2026 contra 280 em 2025 — 25 a mais',
    ]);
  });

  it('o pedido de comparação chega ao caso de uso', async () => {
    const { servico, consulta } = montar(
      {
        linhas: [],
        pecasComPedra: 0,
        pecasSemPedra: 0,
        comparando: false,
        ano: null,
        anoAnterior: null,
        periodo: 'o histórico inteiro',
      },
      'porPedra',
    );

    await servico.montar({ verLoja: true }).gestaoPorPedra({
      periodo: 'ANO',
      compararAnoAnterior: true,
    });

    expect(consulta.mock.calls[0][3]).toBe(true);
  });
});

/**
 * QUEM VENDEU MAIS UMA PEDRA — 16/11/2026.
 *
 * Nasceu do teste local: o Lucas perguntou *"quem vendeu mais diamante esse
 * ano?"* e a Anastasia respondeu, com razão, que o ranking dela conta por
 * TIPO de peça e não por pedra.
 */
describe('quem vendeu mais uma pedra, na ferramenta', () => {
  function montarRanking(resposta: unknown) {
    return montar(resposta, 'quemVendeuPedra');
  }

  it('a linha traz a vendedora, as peças e o valor', async () => {
    const { servico } = montarRanking({
      status: 'OK',
      pedra: 'Diamante',
      linhas: [
        { nome: 'CAMILA BRITO', quantidade: 56, valor: 2604780 },
        { nome: 'BIANCA', quantidade: 27, valor: 1156748 },
      ],
      pedras: [],
    });

    const r = await servico
      .montar({ verLoja: true })
      .gestaoQuemVendePedra({ pedra: 'diamante' });

    expect(r.status).toBe('OK');
    expect(r.pedra).toBe('Diamante');
    expect(r.linhas).toEqual([
      `CAMILA BRITO: 56 peças — ${moeda(2604780)}`,
      `BIANCA: 27 peças — ${moeda(1156748)}`,
    ]);
  });

  it('o nome desconhecido volta com a lista das pedras', async () => {
    const { servico } = montarRanking({
      status: 'PEDRA_DESCONHECIDA',
      pedra: null,
      linhas: [],
      pedras: ['agata', 'diamante', 'esmeralda'],
    });

    const r = await servico
      .montar({ verLoja: true })
      .gestaoQuemVendePedra({ pedra: 'brilhante' });

    expect(r.status).toBe('PEDRA_DESCONHECIDA');
    expect(r.linhas).toEqual([]);
    expect(r.pedras).toEqual(['agata', 'diamante', 'esmeralda']);
  });

  it('ninguém vendeu aquela pedra no período devolve OK vazio', async () => {
    const { servico } = montarRanking({
      status: 'OK',
      pedra: 'Tanzanita',
      linhas: [],
      pedras: [],
      periodo: 'de 01/01/2026 a 16/11/2026',
      escopo: 'LOJA',
    });

    const r = await servico
      .montar({ verLoja: true })
      .gestaoQuemVendePedra({ pedra: 'tanzanita', periodo: 'HOJE' });

    expect(r).toEqual({
      status: 'OK',
      pedra: 'Tanzanita',
      linhas: [],
      pedras: [],
      periodo: 'de 01/01/2026 a 16/11/2026',
      escopo: 'LOJA',
    });
  });

  it('quem não vê a loja não recebe nada, e o banco nem é consultado', async () => {
    const { servico, consulta } = montarRanking({
      status: 'OK',
      pedra: 'Diamante',
      linhas: [{ nome: 'CAMILA', quantidade: 1, valor: 1 }],
      pedras: [],
    });

    const r = await servico.montar({}).gestaoQuemVendePedra({ pedra: 'diamante' });

    expect(r.status).toBe('INDISPONIVEL');
    expect(consulta).not.toHaveBeenCalled();
  });

  it('o período em datas e o limite chegam ao caso de uso', async () => {
    const { servico, consulta } = montarRanking({
      status: 'OK',
      pedra: 'Diamante',
      linhas: [],
      pedras: [],
    });

    await servico.montar({ verLoja: true }).gestaoQuemVendePedra({
      pedra: 'diamante',
      de: '2026-01-01',
      ate: '2026-11-16',
      limite: 5,
    });

    const [termo, recorte, de, ate, limite] = consulta.mock.calls[0];
    expect(termo).toBe('diamante');
    expect(recorte).toBeUndefined();
    expect(de).toEqual(new Date(2026, 0, 1));
    expect(ate).toEqual(new Date(2026, 10, 16));
    expect(limite).toBe(5);
  });
});

/**
 * QUEM VÊ O QUÊ NAS QUEBRAS — 17/11/2026.
 *
 * ==========================================================================
 * O CANAL DA GERENTE DE VENDAS É A HELENA, E LÁ `verLoja` É SEMPRE FALSO.
 *
 * Está cravado no `processar-mensagem-interna.use-case.ts`: *"O FATURAMENTO DA
 * LOJA NÃO ENTRA PELA HELENA. Quem o enxerga é desviado para a Anastasia no
 * roteador, então aqui isto é sempre falso."*
 *
 * Em 16/11 eu pendurei as quatro quebras em `verLoja`. O efeito não era perder
 * detalhe: era a Nathalia — gerente de vendas E vendedora com um número só —
 * não ter NENHUMA delas no canal onde ela trabalha.
 *
 * A REGRA PASSA A SER `verLoja || equipe !== null`. E ela fecha um vazamento
 * que eu também não tinha visto: um GERENTE_VENDAS SEM equipe resolveria para
 * `equipe = null`, e um recorte nulo é a loja inteira.
 * ==========================================================================
 */
describe('o escopo das quebras', () => {
  function montarComCtx(ctx: Record<string, unknown>, resposta: unknown) {
    const porTipo = jest.fn().mockResolvedValue(resposta);
    const quemVendeuPedra = jest.fn().mockResolvedValue({
      status: 'OK',
      pedra: 'Diamante',
      linhas: [],
      pedras: [],
      periodo: 'o histórico inteiro',
    });

    const deps = Array.from({ length: 32 }, (_, i) =>
      naoParaTudo(`colaborador ${i}`),
    );
    deps[1] = { porTipo, quemVendeuPedra } as never;

    const servico = new FerramentasGestaoService(
      ...(deps as unknown as ConstructorParameters<
        typeof FerramentasGestaoService
      >),
    );
    return { ferramentas: servico.montar(ctx as never), porTipo, quemVendeuPedra };
  }

  const VAZIA = {
    linhas: [],
    totalDeJoia: 0,
    totalDeJoiaAnterior: 0,
    comparando: false,
    ano: null,
    anoAnterior: null,
    periodo: 'o histórico inteiro',
  };

  it('quem vê a loja consulta sem recorte, e a resposta diz LOJA', async () => {
    const { ferramentas, porTipo } = montarComCtx({ verLoja: true }, VAZIA);

    const r = await ferramentas.gestaoPorTipo({});

    expect(r.status).toBe('OK');
    expect(r.escopo).toBe('LOJA');
    // O recorte é o SEXTO argumento do caso de uso.
    expect(porTipo.mock.calls[0][5]).toBeNull();
  });

  it('a gerente de vendas consulta a equipe dela, e a resposta diz EQUIPE', async () => {
    const { ferramentas, porTipo } = montarComCtx(
      { verLoja: false, equipe: ['v1', 'v2'] },
      VAZIA,
    );

    const r = await ferramentas.gestaoPorTipo({});

    expect(r.status).toBe('OK');
    expect(r.escopo).toBe('EQUIPE');
    expect(porTipo.mock.calls[0][5]).toEqual(['v1', 'v2']);
  });

  /**
   * O VAZAMENTO QUE A TRAVA FECHA. Sem ela, este caso consultaria com recorte
   * `null` — a loja inteira — para quem não pode vê-la.
   */
  it('sem loja e sem equipe não há quebra nenhuma, e o banco nem é tocado', async () => {
    const { ferramentas, porTipo } = montarComCtx(
      { verLoja: false, equipe: null },
      VAZIA,
    );

    const r = await ferramentas.gestaoPorTipo({});

    expect(r.status).toBe('INDISPONIVEL');
    expect(porTipo).not.toHaveBeenCalled();
  });

  /** `[]` é um recorte legítimo: equipe sem ninguém devolve nada, não a loja. */
  it('equipe vazia consulta e devolve vazio, em vez de devolver a loja', async () => {
    const { ferramentas, porTipo } = montarComCtx(
      { verLoja: false, equipe: [] },
      VAZIA,
    );

    const r = await ferramentas.gestaoPorTipo({});

    expect(r.status).toBe('OK');
    expect(r.escopo).toBe('EQUIPE');
    expect(porTipo.mock.calls[0][5]).toEqual([]);
  });

  /**
   * O CONSERTO DO IRMÃO: o `quem_mais_vende` nunca foi pendurado em `verLoja`
   * — ele filtra pelo `alcanca`. A versão da pedra fazia o contrário.
   */
  it('o ranking de uma pedra chega à gerente, e com a equipe dela', async () => {
    const { ferramentas, quemVendeuPedra } = montarComCtx(
      { verLoja: false, equipe: ['v1'] },
      VAZIA,
    );

    const r = await ferramentas.gestaoQuemVendePedra({ pedra: 'diamante' });

    expect(r.status).toBe('OK');
    expect(r.escopo).toBe('EQUIPE');
    // O recorte é o SÉTIMO argumento do `quemVendeuPedra`.
    expect(quemVendeuPedra.mock.calls[0][6]).toEqual(['v1']);
  });
});

/**
 * O VALOR DAS VENDAS, NA FERRAMENTA — 17/11/2026.
 *
 * ==========================================================================
 * "VALOR DAS VENDAS DESSE MÊS" ≠ "QUAIS AS VENDAS DESSE MÊS".
 *
 * A gestora pediu o total quatro vezes e levou as 25 linhas quatro vezes,
 * porque não existia ferramenta para o valor da loja sem lista — o
 * `vendas_de_vendedora` exige nome e o `vendas_detalhadas` imprime a tabela
 * como efeito de ser chamado.
 * ==========================================================================
 */
describe('o valor das vendas, sem a lista', () => {
  function montarValor(resposta: unknown, ctx: Record<string, unknown> = { verLoja: true }) {
    const valorDasVendas = jest.fn().mockResolvedValue(resposta);
    const deps = Array.from({ length: 32 }, (_, i) =>
      naoParaTudo(`colaborador ${i}`),
    );
    deps[1] = { valorDasVendas } as never;
    const servico = new FerramentasGestaoService(
      ...(deps as unknown as ConstructorParameters<
        typeof FerramentasGestaoService
      >),
    );
    return { ferramentas: servico.montar(ctx as never), valorDasVendas };
  }

  const COM_DEVOLUCAO = {
    quantidade: 25,
    bruto: 1837916.8,
    devolucoes: 1,
    valorDevolvido: 22046,
    receita: 1815870.8,
    ticketMedio: 72634.83,
    clientes: 23,
    periodo: 'de 01/11/2026 a 17/11/2026',
  };

  /**
   * OS DOIS LADOS, ROTULADOS. Na conversa de 16/11 sairam R$ 1.837.916,80 e
   * R$ 1.815.870,80 no mesmo mes, e a gestora sem como saber qual era qual.
   */
  it('com devolução no período, a resposta traz os dois números', async () => {
    const { ferramentas } = montarValor(COM_DEVOLUCAO);

    const r = await ferramentas.gestaoValorDasVendas({ periodo: 'MES' });

    expect(r.status).toBe('OK');
    expect(r.linhas).toEqual([
      `25 vendas — ${moeda(1837916.8)}`,
      `Devoluções: 1 — ${moeda(22046)}`,
      `Receita, já descontada a devolução: ${moeda(1815870.8)}`,
      `Ticket médio: ${moeda(72634.83)}`,
    ]);
  });

  /**
   * SEM DEVOLUÇÃO, AS DUAS LINHAS SERIAM O MESMO NÚMERO — e número repetido
   * com dois rótulos diferentes faz quem lê procurar a diferença que não
   * existe.
   */
  it('sem devolução, não repete o número com dois nomes', async () => {
    const { ferramentas } = montarValor({
      ...COM_DEVOLUCAO,
      devolucoes: 0,
      valorDevolvido: 0,
      receita: 1837916.8,
    });

    const r = await ferramentas.gestaoValorDasVendas({ periodo: 'MES' });

    expect(r.linhas).toEqual([
      `25 vendas — ${moeda(1837916.8)}`,
      `Ticket médio: ${moeda(72634.83)}`,
    ]);
  });

  it('uma venda sai no singular', async () => {
    const { ferramentas } = montarValor({
      ...COM_DEVOLUCAO,
      quantidade: 1,
      devolucoes: 0,
      valorDevolvido: 0,
      bruto: 8750,
      receita: 8750,
      ticketMedio: 8750,
    });

    const r = await ferramentas.gestaoValorDasVendas({});

    expect(r.linhas[0]).toBe(`1 venda — ${moeda(8750)}`);
  });

  it('período sem venda devolve a lista vazia, e diz o período', async () => {
    const { ferramentas } = montarValor({
      ...COM_DEVOLUCAO,
      quantidade: 0,
      bruto: 0,
      devolucoes: 0,
      valorDevolvido: 0,
      receita: 0,
      ticketMedio: 0,
      periodo: 'de 17/11/2026 a 17/11/2026',
    });

    const r = await ferramentas.gestaoValorDasVendas({ periodo: 'HOJE' });

    expect(r.linhas).toEqual([]);
    expect(r.periodo).toBe('de 17/11/2026 a 17/11/2026');
  });

  it('a gerente recebe o valor do time dela, e a resposta diz EQUIPE', async () => {
    const { ferramentas, valorDasVendas } = montarValor(COM_DEVOLUCAO, {
      verLoja: false,
      equipe: ['v1', 'v2'],
    });

    const r = await ferramentas.gestaoValorDasVendas({ periodo: 'MES' });

    expect(r.escopo).toBe('EQUIPE');
    // O recorte e o QUINTO argumento do caso de uso.
    expect(valorDasVendas.mock.calls[0][4]).toEqual(['v1', 'v2']);
  });

  it('sem loja e sem equipe, não responde e não consulta', async () => {
    const { ferramentas, valorDasVendas } = montarValor(COM_DEVOLUCAO, {
      verLoja: false,
      equipe: null,
    });

    const r = await ferramentas.gestaoValorDasVendas({ periodo: 'MES' });

    expect(r.status).toBe('INDISPONIVEL');
    expect(valorDasVendas).not.toHaveBeenCalled();
  });

  it('o período em datas chega ao caso de uso', async () => {
    const { ferramentas, valorDasVendas } = montarValor(COM_DEVOLUCAO);

    await ferramentas.gestaoValorDasVendas({
      de: '2026-11-01',
      ate: '2026-11-16',
    });

    const [recorte, de, ate] = valorDasVendas.mock.calls[0];
    expect(recorte).toBeUndefined();
    expect(de).toEqual(new Date(2026, 10, 1));
    expect(ate).toEqual(new Date(2026, 10, 16));
  });
});
