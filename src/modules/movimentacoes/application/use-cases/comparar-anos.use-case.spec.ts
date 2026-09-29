import { CompararAnosUseCase, variacao } from './comparar-anos.use-case';

/**
 * A COMPARACAO ANO A ANO — 29/09/2026.
 *
 * ==========================================================================
 * O DEFEITO QUE ESTES TESTES IMPEDEM ACONTECE TODO MES, E SEMPRE NA MESMA
 * DIRECAO.
 *
 * Comparar um mes que ainda corre com meses fechados faz o ano atual parecer
 * pior — sempre, e mais no comeco do mes: no dia 3, a loja apareceria com 90%
 * de queda. O numero e verdadeiro e a leitura e falsa.
 *
 * Conferido contra a base real em 29/09: setembro/2024 ate o dia 29 deu
 * R$ 511 mil, e o mes fechou em R$ 847 mil — 66% de diferenca.
 * ==========================================================================
 */
describe('a comparação ano a ano', () => {
  // 29 de setembro de 2026, uma terça.
  const AGORA = new Date(2026, 8, 29, 14, 0, 0);

  let repo: Record<string, jest.Mock>;
  let useCase: CompararAnosUseCase;

  beforeEach(() => {
    repo = {
      compararMesNosAnos: jest.fn().mockResolvedValue([]),
      compararPeriodoNosAnos: jest.fn().mockResolvedValue([]),
    };
    useCase = new CompararAnosUseCase(repo as never);
  });

  describe('o corte no dia', () => {
    /* O mês que está correndo é cortado; os outros, não. */
    it('o mês CORRENTE é cortado no dia de hoje', async () => {
      const r = await useCase.porMes(9, null, AGORA);

      expect(r.cortadoNoDia).toBe(29);
      expect(repo.compararMesNosAnos).toHaveBeenCalledWith(9, 29, null);
    });

    it('mês JÁ FECHADO não é cortado — ele terminou', async () => {
      const r = await useCase.porMes(3, null, AGORA);

      expect(r.cortadoNoDia).toBeNull();
      expect(repo.compararMesNosAnos).toHaveBeenCalledWith(3, null, null);
    });

    it('mês futuro também não é cortado', async () => {
      await useCase.porMes(12, null, AGORA);
      expect(repo.compararMesNosAnos).toHaveBeenCalledWith(12, null, null);
    });

    /* Só o ano corrente pode estar parcial: os outros setembros acabaram. */
    it('só o ano corrente vem marcado como parcial', async () => {
      repo.compararMesNosAnos.mockResolvedValue([
        { ano: 2026, receita: 100, quantidade: 2, receitaFechada: null },
        { ano: 2025, receita: 200, quantidade: 4, receitaFechada: 300 },
      ]);

      const r = await useCase.porMes(9, null, AGORA);

      expect(r.anos.find((a) => a.ano === 2026)!.parcial).toBe(true);
      expect(r.anos.find((a) => a.ano === 2025)!.parcial).toBe(false);
    });

    it('sem corte, nenhum ano é parcial', async () => {
      repo.compararMesNosAnos.mockResolvedValue([
        { ano: 2026, receita: 100, quantidade: 2, receitaFechada: null },
      ]);

      const r = await useCase.porMes(3, null, AGORA);
      expect(r.anos[0].parcial).toBe(false);
    });
  });

  describe('o ticket médio', () => {
    it('é receita sobre vendas, arredondado', async () => {
      repo.compararMesNosAnos.mockResolvedValue([
        { ano: 2026, receita: 1000, quantidade: 3, receitaFechada: null },
      ]);

      expect((await useCase.porMes(9, null, AGORA)).anos[0].ticketMedio).toBe(333);
    });

    /* Ano sem venda aparece na comparação — a linha inteira não pode virar
     * "NaN" por causa de uma divisão por zero. */
    it('ano sem venda dá ticket zero, e não NaN', async () => {
      repo.compararMesNosAnos.mockResolvedValue([
        { ano: 2023, receita: 0, quantidade: 0, receitaFechada: null },
      ]);

      const t = (await useCase.porMes(9, null, AGORA)).anos[0].ticketMedio;
      expect(t).toBe(0);
      expect(Number.isNaN(t)).toBe(false);
    });
  });

  describe('o período livre', () => {
    it('repete o (mês, dia), e não a data', async () => {
      await useCase.porPeriodo(
        new Date(2026, 8, 1),
        new Date(2026, 8, 15),
        null,
        AGORA,
      );

      expect(repo.compararPeriodoNosAnos).toHaveBeenCalledWith(
        { mes: 9, dia: 1 },
        { mes: 9, dia: 15 },
        null,
      );
    });

    /*
     * INTERVALO QUE VIRA O ANO E RECUSADO.
     *
     * "15/12 a 15/01" existiria em dois anos ao mesmo tempo, e qualquer
     * resposta seria uma escolha arbitrária entre duas leituras. Recusar com
     * o motivo é melhor que escolher em silêncio.
     */
    it('recusa o intervalo que atravessa a virada do ano', async () => {
      const r = await useCase.porPeriodo(
        new Date(2026, 11, 15),
        new Date(2026, 0, 15),
        null,
        AGORA,
      );

      expect(r).toEqual({ erro: 'PERIODO_VIRA_O_ANO' });
      expect(repo.compararPeriodoNosAnos).not.toHaveBeenCalled();
    });

    it('mesmo mês com dia final antes do inicial também é recusado', async () => {
      const r = await useCase.porPeriodo(
        new Date(2026, 8, 20),
        new Date(2026, 8, 5),
        null,
        AGORA,
      );

      expect(r).toEqual({ erro: 'PERIODO_VIRA_O_ANO' });
    });

    it('um único dia é aceito', async () => {
      const r = await useCase.porPeriodo(
        new Date(2026, 8, 10),
        new Date(2026, 8, 10),
        null,
        AGORA,
      );

      expect('erro' in r).toBe(false);
    });
  });

  it('o recorte por vendedora propaga', async () => {
    await useCase.porMes(9, 'vd-1', AGORA);
    expect(repo.compararMesNosAnos).toHaveBeenCalledWith(9, 29, 'vd-1');
  });

  it('o rótulo do mês é escrito à mão, e sai em português', async () => {
    expect((await useCase.porMes(9, null, AGORA)).rotulo).toBe('setembro');
    expect((await useCase.porMes(3, null, AGORA)).rotulo).toBe('março');
  });
});

/**
 * A VARIACAO SEM BASE NAO E UM NUMERO.
 *
 * Dividir por zero daria `Infinity`, e "crescemos infinito por cento" e pior
 * que nao dizer nada — soa como dado e nao e.
 */
describe('a variação contra o ano anterior', () => {
  it.each([
    [150, 100, 50],
    [50, 100, -50],
    [100, 100, 0],
    [2638764, 511555, 416],
  ])('%s sobre %s = %s%%', (atual, anterior, esperado) => {
    expect(variacao(atual, anterior)).toBe(esperado);
  });

  it('base zero devolve null, e não Infinity', () => {
    expect(variacao(1000, 0)).toBeNull();
    expect(variacao(0, 0)).toBeNull();
  });
});
