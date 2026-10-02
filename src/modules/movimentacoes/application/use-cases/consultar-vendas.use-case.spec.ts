import {
  ConsultarVendasUseCase,
  LIMITE_MAXIMO,
  LIMITE_PADRAO,
} from './consultar-vendas.use-case';
import type {
  ItemMaisVendido,
  IVendasMovimentacaoRepository,
  JanelaDeVendas,
  VendedoraNoRanking,
} from '../../domain/ports/repositories/vendas-movimentacao-repository.port';

/**
 * A VENDA LIDA DA MOVIMENTACAO — 25/09/2026.
 *
 * O SQL e conferido contra a copia de producao; o que estes testes protegem e
 * a JANELA e a forma da resposta, que e onde o erro passa despercebido. Uma
 * janela errada nao quebra nada: devolve um numero plausivel e menor.
 */
describe('ConsultarVendasUseCase', () => {
  // 25/09/2026, uma quinta-feira, 14h30.
  const AGORA = new Date(2026, 8, 25, 14, 30, 0);

  const VAZIO = {
    quantidade: 0,
    receita: 0,
    ticketMedio: 0,
    devolucoes: 0,
    valorDevolvido: 0,
    // Clientes DISTINTOS (29/09/2026): "quantos clientes tive" e "quantas
    // vendas fiz" sao perguntas diferentes, e ate hoje so havia a segunda.
    clientes: 0,
  };

  let janelas: JanelaDeVendas[];
  let repo: jest.Mocked<IVendasMovimentacaoRepository>;
  let useCase: ConsultarVendasUseCase;

  beforeEach(() => {
    janelas = [];
    repo = {
      // A listagem detalhada (02/10) nao e usada por este caso de uso — entra
      // no duble porque a porta a exige.
      listarDetalhadas: jest.fn().mockResolvedValue({ vendas: [], total: 0 }),
      resumo: jest.fn(async (j) => {
        janelas.push(j);
        return { ...VAZIO, quantidade: 3, receita: 300, ticketMedio: 100 };
      }),
      rankingDeVendedoras: jest.fn(async (j: JanelaDeVendas, _limite: number) => {
        janelas.push(j);
        return [] as VendedoraNoRanking[];
      }),
      itensMaisVendidos: jest.fn(
        async (j: JanelaDeVendas, _limite: number, _v?: string | null) => {
          janelas.push(j);
          return [] as ItemMaisVendido[];
        },
      ),
      // O ranking por tipo de peca (28/09/2026). Entra na lista de janelas
      // como os outros: e a JANELA que estes testes conferem, nao o conteudo.
      rankingPorFamilia: jest.fn(
        async (j: JanelaDeVendas, _familia: string, _limite: number) => {
          janelas.push(j);
          return [];
        },
      ),
      // O mes recorrente NAO recebe janela — ele monta a propria pelo
      // `extract(month)`. Por isso nao entra na lista de janelas conferidas.
      rankingPorFamiliaNoMes: jest.fn(
        async (_mes: number, _familia: string, _porAno: number) => [],
      ),
      // A comparacao ano a ano (29/09/2026). Como o mes recorrente, ela NAO
      // recebe janela: monta a propria pelo `extract`.
      compararMesNosAnos: jest.fn(
        async (_mes: number, _dia: number | null, _v: string | null) => [],
      ),
      compararPeriodoNosAnos: jest.fn(
        async (
          _i: { mes: number; dia: number },
          _f: { mes: number; dia: number },
          _v: string | null,
        ) => [],
      ),
    };
    useCase = new ConsultarVendasUseCase(repo);
  });

  describe('a janela de cada recorte', () => {
    it('HOJE vai da meia-noite ate AGORA — e nao ate o fim do dia', async () => {
      await useCase.resumo('HOJE', null, AGORA);

      const [j] = janelas;
      expect(j.de).toEqual(new Date(2026, 8, 25, 0, 0, 0, 0));
      // Perguntar "quanto vendemos hoje" as 14h30 e receber a noite junto
      // seria mentira — e uma mentira que ninguem confere.
      expect(j.ate).toEqual(AGORA);
    });

    it('ONTEM e o dia inteiro de ontem, e para antes de hoje', async () => {
      await useCase.resumo('ONTEM', null, AGORA);

      const [j] = janelas;
      expect(j.de).toEqual(new Date(2026, 8, 24, 0, 0, 0, 0));
      expect(j.ate).toEqual(new Date(2026, 8, 24, 23, 59, 59, 999));
    });

    it('SEMANA sao sete dias contando hoje', async () => {
      await useCase.resumo('SEMANA', null, AGORA);

      expect(janelas[0].de).toEqual(new Date(2026, 8, 19, 0, 0, 0, 0));
    });

    /* O mes do CALENDARIO, e nao "ultimos 30 dias": quem pergunta "como esta o
     * mes" compara com a meta do mes. Ate 25/09 isto eram 30 dias corridos, e
     * o numero nunca batia com nada que a gestao acompanha. */
    it('MES comeca no dia 1', async () => {
      await useCase.resumo('MES', null, AGORA);

      expect(janelas[0].de).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    });

    it('ANO comeca em 1 de janeiro', async () => {
      await useCase.resumo('ANO', null, AGORA);

      expect(janelas[0].de).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    });

    it('sem recorte, o padrao e HOJE', async () => {
      await useCase.resumo(undefined, null, AGORA);

      expect(janelas[0].de).toEqual(new Date(2026, 8, 25, 0, 0, 0, 0));
    });
  });

  /*
   * ==========================================================================
   * O DIA VAZIO E O CASO COMUM, E NAO A EXCECAO.
   *
   * Em 2026 a loja teve venda em 12 dias por mes, em media. "Hoje" vem zerado
   * na maioria das vezes, e uma resposta que so diz "nenhuma venda hoje"
   * parece defeito — ainda mais agora, que o dado acabou de chegar.
   * ==========================================================================
   */
  describe('o dia vazio traz o mes junto', () => {
    it('HOJE zerado consulta tambem o mes', async () => {
      repo.resumo
        .mockResolvedValueOnce(VAZIO)
        .mockResolvedValueOnce({ ...VAZIO, quantidade: 22, receita: 1_309_479 });

      const r = await useCase.resumo('HOJE', null, AGORA);

      expect(r.quantidade).toBe(0);
      expect(r.mes?.quantidade).toBe(22);
      // A segunda consulta e a do MES — pelas chamadas, e nao pelas janelas
      // registradas: `mockResolvedValueOnce` substitui a implementacao.
      expect(repo.resumo.mock.calls[1][0].de).toEqual(
        new Date(2026, 8, 1, 0, 0, 0, 0),
      );
    });

    it('HOJE com venda NAO paga a segunda consulta', async () => {
      const r = await useCase.resumo('HOJE', null, AGORA);

      expect(r.mes).toBeUndefined();
      expect(repo.resumo).toHaveBeenCalledTimes(1);
    });

    it('outro recorte vazio nao traz o mes — a pergunta foi outra', async () => {
      repo.resumo.mockResolvedValue(VAZIO);

      const r = await useCase.resumo('SEMANA', null, AGORA);

      expect(r.mes).toBeUndefined();
      expect(repo.resumo).toHaveBeenCalledTimes(1);
    });
  });

  describe('o limite da lista', () => {
    it('sem pedido, sao 10', async () => {
      await useCase.itens('MES', undefined, null, AGORA);

      expect(repo.itensMaisVendidos).toHaveBeenCalledWith(
        expect.anything(),
        LIMITE_PADRAO,
        null,
      );
    });

    it('ela pede outro numero e ele vale', async () => {
      await useCase.itens('MES', 5, null, AGORA);

      expect(repo.itensMaisVendidos.mock.calls[0][1]).toBe(5);
    });

    /* Lista de 500 no WhatsApp ninguem le, e paga-se o token de todas. */
    it('pedido absurdo cai no teto', async () => {
      await useCase.itens('MES', 500, null, AGORA);

      expect(repo.itensMaisVendidos.mock.calls[0][1]).toBe(LIMITE_MAXIMO);
    });

    it.each([0, -3, NaN])('limite invalido (%s) volta ao padrao', async (n) => {
      await useCase.ranking('MES', n, AGORA);

      expect(repo.rankingDeVendedoras.mock.calls[0][1]).toBe(LIMITE_PADRAO);
    });
  });

  /* O recorte por vendedora e o que faz a MESMA consulta servir ao canal dela
   * sem que ela veja a equipe. */
  it('a vendedora so ve o que e dela', async () => {
    await useCase.resumo('MES', 'vd-1', AGORA);
    await useCase.itens('MES', 10, 'vd-1', AGORA);

    expect(repo.resumo.mock.calls[0][1]).toBe('vd-1');
    expect(repo.itensMaisVendidos.mock.calls[0][2]).toBe('vd-1');
  });

  /* Datas soltas chegam como meia-noite; sem esticar o fim, o ultimo dia do
   * periodo fica de fora inteiro — o mesmo defeito que a tela de Vendas teve
   * em 11/09. */
  it('periodo em datas abraça o ultimo dia inteiro', async () => {
    await useCase.resumoEntre(new Date(2026, 7, 1), new Date(2026, 7, 31));

    expect(janelas[0].ate).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });
});
