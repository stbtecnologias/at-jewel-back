import {
  CompararPeriodoAnteriorUseCase,
  variacaoEntre,
} from './comparar-periodo-anterior.use-case';

/**
 * ESTE PERIODO CONTRA O ANTERIOR — 29/09/2026.
 *
 * ==========================================================================
 * O QUE ESTES TESTES GUARDAM SAO AS JANELAS, QUE E ONDE O ERRO NAO APARECE.
 *
 * Uma janela errada nao quebra nada: devolve um numero plausivel para outra
 * pergunta. Comparar um mes que corre com um mes fechado diria que a loja
 * caiu TODO MES — e no dia 2 a queda aparente seria de 93%.
 * ==========================================================================
 */
describe('a comparação com o período anterior', () => {
  // 29 de setembro de 2026, uma terça, 14h.
  const AGORA = new Date(2026, 8, 29, 14, 0, 0);

  const VAZIO = {
    quantidade: 0,
    receita: 0,
    ticketMedio: 0,
    devolucoes: 0,
    valorDevolvido: 0,
    clientes: 0,
  };

  let janelas: Array<{ de: Date; ate: Date }>;
  let repo: { resumo: jest.Mock };
  let useCase: CompararPeriodoAnteriorUseCase;

  beforeEach(() => {
    janelas = [];
    repo = {
      resumo: jest.fn(async (j: { de: Date; ate: Date }) => {
        janelas.push(j);
        return VAZIO;
      }),
    };
    useCase = new CompararPeriodoAnteriorUseCase(repo as never);
  });

  describe('SEMANA — rolante, sem corte', () => {
    it('são sete dias contando hoje, contra os sete anteriores', async () => {
      await useCase.porRecorte('SEMANA', null, AGORA);

      const [atual, anterior] = janelas;
      expect(atual.de).toEqual(new Date(2026, 8, 23, 0, 0, 0, 0));
      expect(atual.ate).toEqual(AGORA);
      expect(anterior.de).toEqual(new Date(2026, 8, 16, 0, 0, 0, 0));
    });

    /* Os dois lados têm sete dias cheios: não há parcial para corrigir. */
    it('não traz período fechado — não houve corte', async () => {
      const c = await useCase.porRecorte('SEMANA', null, AGORA);

      expect(c.anteriorFechado).toBeNull();
      expect(repo.resumo).toHaveBeenCalledTimes(2);
    });

    it('as duas janelas não se sobrepõem', async () => {
      await useCase.porRecorte('SEMANA', null, AGORA);

      const [atual, anterior] = janelas;
      expect(anterior.ate.getTime()).toBeLessThan(atual.de.getTime());
    });
  });

  describe('MES — calendário, com corte', () => {
    it('vai do dia 1 até agora', async () => {
      await useCase.porRecorte('MES', null, AGORA);

      expect(janelas[0].de).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
      expect(janelas[0].ate).toEqual(AGORA);
    });

    /*
     * O ANTERIOR E CORTADO NO MESMO DIA.
     *
     * Sem isso, setembro com 29 dias corridos seria comparado com agosto
     * inteiro (31), e a queda apareceria todo mes, sem excecao.
     */
    it('o mês passado é cortado no MESMO dia', async () => {
      await useCase.porRecorte('MES', null, AGORA);

      const anterior = janelas[1];
      expect(anterior.de).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
      expect(anterior.ate.getDate()).toBe(29);
      expect(anterior.ate.getMonth()).toBe(7); // agosto
    });

    /* "E quanto o mês passado fechou?" é a pergunta seguinte, sempre. */
    it('traz também o mês passado INTEIRO', async () => {
      const c = await useCase.porRecorte('MES', null, AGORA);

      expect(c.anteriorFechado).not.toBeNull();
      expect(repo.resumo).toHaveBeenCalledTimes(3);

      const fechado = janelas[2];
      expect(fechado.de).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
      // Termina um instante antes do dia 1 de setembro: o último de agosto.
      expect(fechado.ate.getMonth()).toBe(7);
      expect(fechado.ate.getDate()).toBe(31);
    });
  });

  describe('ANO — calendário, com corte', () => {
    it('vai de 1º de janeiro até agora, contra o mesmo ponto do ano passado', async () => {
      await useCase.porRecorte('ANO', null, AGORA);

      expect(janelas[0].de).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
      expect(janelas[1].de).toEqual(new Date(2025, 0, 1, 0, 0, 0, 0));
      expect(janelas[1].ate.getFullYear()).toBe(2025);
      expect(janelas[1].ate.getMonth()).toBe(8);
      expect(janelas[1].ate.getDate()).toBe(29);
    });

    it('o ano passado fechado vai junto', async () => {
      const c = await useCase.porRecorte('ANO', null, AGORA);
      expect(c.anteriorFechado).not.toBeNull();
      expect(janelas[2].ate.getFullYear()).toBe(2025);
      expect(janelas[2].ate.getMonth()).toBe(11); // dezembro
    });
  });

  describe('datas soltas', () => {
    /* Quem deu datas quer AQUELE tamanho: não o mês nem o ano anteriores. */
    it('o anterior é o mesmo tamanho, imediatamente antes', async () => {
      // 01/09 a 15/09 = 15 dias.
      await useCase.porDatas(new Date(2026, 8, 1), new Date(2026, 8, 15));

      const [atual, anterior] = janelas;
      const duracao = atual.ate.getTime() - atual.de.getTime();
      const duracaoAnterior = anterior.ate.getTime() - anterior.de.getTime();

      expect(Math.abs(duracao - duracaoAnterior)).toBeLessThanOrEqual(1);
      expect(anterior.ate.getTime()).toBeLessThan(atual.de.getTime());
    });

    /* Data solta chega como meia-noite; sem esticar, o último dia fica de
     * fora inteiro — o mesmo defeito da tela de Vendas em 11/09. */
    it('o último dia entra inteiro', async () => {
      await useCase.porDatas(new Date(2026, 8, 1), new Date(2026, 8, 15));

      expect(janelas[0].ate).toEqual(new Date(2026, 8, 15, 23, 59, 59, 999));
    });

    it('datas soltas não trazem período fechado', async () => {
      const c = await useCase.porDatas(new Date(2026, 8, 1), new Date(2026, 8, 15));
      expect(c.anteriorFechado).toBeNull();
    });
  });

  it('o recorte por vendedora chega nas três consultas', async () => {
    await useCase.porRecorte('MES', 'vd-1', AGORA);

    for (const chamada of repo.resumo.mock.calls) {
      expect(chamada[1]).toBe('vd-1');
    }
  });

  /* Clientes e vendas são números diferentes: a mesma cliente comprando três
   * vezes conta 1 e 3. Os dois sobem para a resposta. */
  it('clientes e vendas vêm separados', async () => {
    repo.resumo.mockResolvedValue({ ...VAZIO, clientes: 12, quantidade: 19 });

    const c = await useCase.porRecorte('SEMANA', null, AGORA);

    expect(c.atual.clientes).toBe(12);
    expect(c.atual.vendas).toBe(19);
  });
});

describe('a variação entre os dois lados', () => {
  it.each([
    [150, 100, 50],
    [50, 100, -50],
    [100, 100, 0],
  ])('%s sobre %s = %s%%', (atual, anterior, esperado) => {
    expect(variacaoEntre(atual, anterior)).toBe(esperado);
  });

  /* Dividir por zero daria Infinity, e "crescemos infinito por cento" soa
   * como dado e não é. */
  it('base zero devolve null, e não Infinity', () => {
    expect(variacaoEntre(1000, 0)).toBeNull();
    expect(variacaoEntre(0, 0)).toBeNull();
  });
});
