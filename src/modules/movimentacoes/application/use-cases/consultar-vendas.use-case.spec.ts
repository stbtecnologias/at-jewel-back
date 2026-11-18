import {
  ConsultarVendasUseCase,
  LIMITE_MAXIMO,
  LIMITE_DO_ARQUIVO,
  LIMITE_PADRAO,
  SEM_METAL,
} from './consultar-vendas.use-case';
import type {
  ItemMaisVendido,
  IVendasMovimentacaoRepository,
  JanelaDeVendas,
  VendasPorCor,
  VendedoraNoRanking,
  VendasPorTipoCru,
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
      // Idem para as devolucoes em numero (18/11, tarde): os testes dela
      // vivem em `devolucoes.spec.ts`.
      devolucoes: jest
        .fn()
        .mockResolvedValue({ documentos: 0, pecas: 0, valor: 0 }),
      // Idem para as consignacoes (18/11): a porta as exige, este caso de uso
      // tem o metodo e os testes dele vivem em `consignacoes.spec.ts`.
      consignacoes: jest.fn().mockResolvedValue({
        saidas: { quantidade: 0, valor: 0, pecas: 0 },
        retornos: { quantidade: 0, valor: 0, pecas: 0 },
      }),
      receitaPorEmpresa: jest.fn().mockResolvedValue([]),
      vendasPorTipo: jest.fn().mockResolvedValue([]),
      vendasPorPedra: jest.fn().mockResolvedValue([]),
      // A faixa de valor (13/10) tambem nao e exercitada aqui — entra no
      // duble porque a porta a exige.
      pecasPorFaixaDeValor: jest.fn(),
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
        async (
          j: JanelaDeVendas,
          _familia: string,
          _prefixos: string[] | null,
          _limite: number,
        ) => {
          janelas.push(j);
          return [];
        },
      ),
      // O mes recorrente NAO recebe janela — ele monta a propria pelo
      // `extract(month)`. Por isso nao entra na lista de janelas conferidas.
      rankingPorFamiliaNoMes: jest.fn(
        async (
          _mes: number,
          _familia: string,
          _prefixos: string[] | null,
          _porAno: number,
        ) => [],
      ),
      // A comparacao ano a ano (29/09/2026). Como o mes recorrente, ela NAO
      // recebe janela: monta a propria pelo `extract`.
      compararMesNosAnos: jest.fn(
        async (_mes: number, _dia: number | null, _v: string | null) => [],
      ),
      // A quebra por metal (16/11/2026). Cada teste decide o que devolve.
      vendasPorMetal: jest.fn(async (j?: JanelaDeVendas) => {
        if (j) janelas.push(j);
        return [] as VendasPorCor[];
      }),
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

    /**
     * ======================================================================
     * O TETO SUBIU, E 500 PASSOU A SER UM PEDIDO NORMAL — 28/10/2026.
     *
     * O comentario antigo deste teste era *"lista de 500 no WhatsApp ninguem
     * le, e paga-se o token de todas"*, e estava certo enquanto a lista na
     * conversa fosse o que a pessoa lia. Desde 28/10 ela nao e: a lista
     * inteira sai escrita pelo nosso codigo, e o modelo recebe uma dezena de
     * linhas.
     *
     * O 30 como PADRAO era corte silencioso — foi ele que fez o PDF das "43
     * vendas" sair com trinta em 27/10 e o das 582 pecas sair com dez em
     * 28/10. O que o teste protege agora e o contrario: 500 CHEGA ao banco.
     * ======================================================================
     */
    it('pedido de 500 chega inteiro ao banco', async () => {
      await useCase.itens('MES', 500, null, AGORA);

      expect(repo.itensMaisVendidos.mock.calls[0][1]).toBe(500);
    });

    it('e o teto da casa ainda existe, para o pedido sem tamanho', async () => {
      // Consulta sem teto nenhum e o caminho para uma query acidental
      // trazer a base inteira para a memoria.
      await useCase.itens('MES', 999_999, null, AGORA);

      expect(repo.itensMaisVendidos.mock.calls[0][1]).toBe(LIMITE_DO_ARQUIVO);
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
  /**
   * A QUEBRA POR TIPO DE OURO — 16/11/2026.
   *
   * O caso de uso e quem NOMEIA o metal, consultando o dicionario da casa. O
   * repositorio devolve a `cor` e a etiqueta CRUAS de proposito: esta casa
   * nao tem teste de repositorio, e regra dentro do SQL seria regra sem
   * teste.
   */
  describe('a quebra por tipo de ouro', () => {
    it('soma as cores do mesmo metal numa linha so', async () => {
      repo.vendasPorMetal.mockResolvedValue([
        { cor: 'OB 18K', etiqueta: null, quantidade: 2, valor: 100 },
        { cor: 'OB 14K', etiqueta: null, quantidade: 1, valor: 50 },
      ]);

      expect((await useCase.porMetal()).linhas).toEqual([
        { metal: 'Ouro branco', quantidade: 3, valor: 150 },
      ]);
    });

    it('sem cor, a etiqueta nomeia o metal', async () => {
      repo.vendasPorMetal.mockResolvedValue([
        {
          cor: null,
          etiqueta: 'ANEL 50PTS DTS 2.50 CTS OB 18K',
          quantidade: 1,
          valor: 10,
        },
      ]);

      expect((await useCase.porMetal()).linhas[0].metal).toBe('Ouro branco');
    });

    /** A `cor` e campo de METAL; a etiqueta e texto livre. */
    it('a cor manda sobre a etiqueta quando as duas falam', async () => {
      repo.vendasPorMetal.mockResolvedValue([
        {
          cor: 'OA 18K',
          etiqueta: 'BRINCO OB 18K DTS 0.31 CTS',
          quantidade: 1,
          valor: 10,
        },
      ]);

      expect((await useCase.porMetal()).linhas[0].metal).toBe('Ouro amarelo');
    });

    /**
     * SEM CLASSIFICACAO NAO CONCORRE: ela e ressalva, nao um metal. Em 2026
     * sao 181 pecas, e 129 delas sao vaso e vela da categoria HOME.
     */
    it('ordena pelo valor, e sem classificacao vai sempre por ultimo', async () => {
      repo.vendasPorMetal.mockResolvedValue([
        { cor: 'Verde', etiqueta: null, quantidade: 1, valor: 900 },
        { cor: 'OA 18K', etiqueta: null, quantidade: 1, valor: 500 },
        { cor: 'OB 18K', etiqueta: null, quantidade: 1, valor: 800 },
      ]);

      expect((await useCase.porMetal()).linhas.map((l) => l.metal)).toEqual([
        'Ouro branco',
        'Ouro amarelo',
        SEM_METAL,
      ]);
    });

    /**
     * O `pg` DEVOLVE `NUMERIC` COMO TEXTO, e `quantidade` e DECIMAL(10,4).
     *
     * O repositorio converte, como o `itensMaisVendidos` ja fazia. Este teste
     * NAO prova o repositorio — prova que, se um dia o texto escapar, a soma
     * nao CONCATENA em silencio, devolvendo um numero plausivel e enorme.
     */
    it('se o texto do pg escapar, a soma nao concatena', async () => {
      repo.vendasPorMetal.mockResolvedValue([
        {
          cor: 'OB 18K',
          etiqueta: null,
          quantidade: '195.0000' as unknown as number,
          valor: '10578550.59' as unknown as number,
        },
        {
          cor: 'OB 18K',
          etiqueta: null,
          quantidade: '5' as unknown as number,
          valor: '1.41' as unknown as number,
        },
      ]);

      const [linha] = (await useCase.porMetal()).linhas;
      expect(linha.quantidade).toBe(200);
      expect(linha.valor).toBeCloseTo(10578552, 2);
    });

    it('periodo sem venda nenhuma devolve lista vazia', async () => {
      repo.vendasPorMetal.mockResolvedValue([]);

      expect(
        (await useCase.porMetal('HOJE', undefined, undefined, AGORA)).linhas,
      ).toEqual([]);
    });

    /** Sem recorte e o historico inteiro, igual ao `porEmpresa`. */
    it('sem recorte nenhum, nao monta janela', async () => {
      await useCase.porMetal();

      // O `null` e o RECORTE DE VENDEDORAS (17/11): sem equipe, a loja inteira.
      expect(repo.vendasPorMetal).toHaveBeenCalledWith(undefined, null);
    });

    it('o periodo em datas abraca o ultimo dia inteiro', async () => {
      await useCase.porMetal(
        undefined,
        new Date(2026, 7, 1),
        new Date(2026, 7, 31),
      );

      const janela = repo.vendasPorMetal.mock.calls[0][0]!;
      expect(janela.ate).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
    });
  });
});

/**
 * A QUEBRA POR TIPO DE PEÇA — 16/11/2026.
 *
 * ==========================================================================
 * A GESTORA PEDIU QUANTIDADE E RECEBEU VALOR.
 *
 * Em 15/11 ela disse *"não quero código de nada, quero por quantidade de
 * peças"*, e recebeu a lista de 60 itens ordenada por VALOR, com quantidade
 * 1 em 58 das 60 linhas. A Anastasia explicou o que faltava: *"só consigo
 * contar um tipo de cada vez. Não tenho um botão que já cuspa 'foram X
 * colares, Y brincos, Z anéis' tudo de uma vez."*
 *
 * E o pedaço que ela conseguia contar estava ERRADO, porque a `familia`
 * guarda tipo e estilo misturados — ver o `tipo-da-peca.spec.ts`.
 * ==========================================================================
 */
describe('a quebra por tipo de peça', () => {
  const AGORA = new Date(2026, 8, 25, 14, 30, 0);

  function montar(cruas: unknown[]) {
    const vendasPorTipo = jest.fn().mockResolvedValue(cruas);
    const useCase = new ConsultarVendasUseCase({
      vendasPorTipo,
    } as unknown as IVendasMovimentacaoRepository);
    return { useCase, vendasPorTipo };
  }

  const linha = (p: Partial<VendasPorTipoCru>): VendasPorTipoCru => ({
    categoria: 'JEWEL',
    codigoErp: 'CO',
    familia: 'COLAR',
    quantidade: 0,
    valor: 0,
    quantidadeAnterior: 0,
    valorAnterior: 0,
    ...p,
  });

  it('o colar riviera soma com o colar, e não vira linha própria', async () => {
    const { useCase } = montar([
      linha({ familia: 'COLAR', quantidade: 94, valor: 900 }),
      linha({ familia: 'RIVEIRA', quantidade: 8, valor: 80 }),
      linha({ familia: 'SOLITARIO', quantidade: 2, valor: 20 }),
    ]);

    const r = await useCase.porTipo();

    expect(r.linhas).toEqual([
      {
        tipo: 'Colar',
        quantidade: 104,
        valor: 1000,
        quantidadeAnterior: 0,
        joia: true,
      },
    ]);
  });

  /**
   * OS 14 "COLARES" FORA DA `JEWEL` em 2026 são colares de verdade — COLLAB
   * VR, WISH, GOLDESIGN, com ouro 18K e diamante.
   */
  it('o colar da COLLAB soma com o colar da JEWEL', async () => {
    const { useCase } = montar([
      linha({
        categoria: 'JEWEL',
        codigoErp: 'CO',
        quantidade: 104,
        valor: 1000,
      }),
      linha({
        categoria: 'COLLAB VR',
        codigoErp: 'CO',
        familia: 'COLAR',
        quantidade: 14,
        valor: 140,
      }),
    ]);

    const r = await useCase.porTipo();

    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].quantidade).toBe(118);
  });

  it('o total de joia conta a joia e não o vaso', async () => {
    const { useCase } = montar([
      linha({ codigoErp: 'CO', quantidade: 104, valor: 1000 }),
      linha({ codigoErp: 'BR', familia: 'BRINCO', quantidade: 91, valor: 900 }),
      linha({
        categoria: 'HOME',
        codigoErp: 'C6',
        familia: 'VASO',
        quantidade: 26,
        valor: 18,
      }),
    ]);

    const r = await useCase.porTipo();

    expect(r.totalDeJoia).toBe(195);
    expect(r.linhas.map((l) => [l.tipo, l.joia])).toEqual([
      ['Colar', true],
      ['Brinco', true],
      ['Vaso', false],
    ]);
  });

  it('ordena pela quantidade, e "sem tipo" vai por último', async () => {
    const { useCase } = montar([
      linha({
        categoria: 'HOME',
        codigoErp: '',
        familia: '',
        quantidade: 500,
        valor: 1,
      }),
      linha({ codigoErp: 'BR', familia: 'BRINCO', quantidade: 91, valor: 900 }),
      linha({ codigoErp: 'CO', quantidade: 104, valor: 1000 }),
    ]);

    const r = await useCase.porTipo();

    expect(r.linhas.map((l) => l.tipo)).toEqual(['Colar', 'Brinco', 'Sem tipo']);
  });

  /** O `pg` devolve NUMERIC como TEXTO, e somar texto CONCATENA em silêncio. */
  it('a quantidade que chega como texto soma, e não concatena', async () => {
    const { useCase } = montar([
      linha({
        quantidade: '94.0000' as unknown as number,
        valor: '900.50' as unknown as number,
      }),
      linha({
        familia: 'RIVEIRA',
        quantidade: '8.0000' as unknown as number,
        valor: '80.50' as unknown as number,
      }),
    ]);

    const r = await useCase.porTipo();

    expect(r.linhas[0].quantidade).toBe(102);
    expect(r.linhas[0].valor).toBe(981);
  });

  it('sem comparação, não pede janela anterior nenhuma', async () => {
    const { useCase, vendasPorTipo } = montar([]);

    await useCase.porTipo('ANO', undefined, undefined, false, AGORA);

    const [janela, anterior] = vendasPorTipo.mock.calls[0];
    expect(janela.de).toEqual(new Date(2026, 0, 1));
    expect(anterior).toBeUndefined();
  });

  /**
   * O CORTE NO MESMO DIA, POR CONSTRUÇÃO.
   *
   * É o erro que eu cometi à mão no plano do ouro: comparei 2025 inteiro com
   * 2026 até novembro, e o ano velho ganhou por ter dois meses a mais. O
   * `comparar_com_outros_anos` já resolvia isso desde 29/09 — montando a
   * janela aqui, ninguém pode errar de novo.
   */
  it('comparando, o ano anterior termina no mesmo dia e mês', async () => {
    const { useCase, vendasPorTipo } = montar([]);

    await useCase.porTipo('ANO', undefined, undefined, true, AGORA);

    const [janela, anterior] = vendasPorTipo.mock.calls[0];
    expect(janela.de).toEqual(new Date(2026, 0, 1));
    expect(janela.ate).toEqual(AGORA);
    expect(anterior.de).toEqual(new Date(2025, 0, 1));
    expect(anterior.ate).toEqual(new Date(2025, 8, 25, 14, 30, 0));
  });

  it('comparando com datas livres, o ano anterior acompanha', async () => {
    const { useCase, vendasPorTipo } = montar([]);

    await useCase.porTipo(
      undefined,
      new Date(2026, 0, 1),
      new Date(2026, 10, 16),
      true,
      AGORA,
    );

    const [, anterior] = vendasPorTipo.mock.calls[0];
    expect(anterior.de).toEqual(new Date(2025, 0, 1));
    expect(anterior.ate).toEqual(new Date(2025, 10, 16, 23, 59, 59, 999));
  });

  /** 29 de fevereiro não existe no ano anterior: cai no último dia do mês. */
  it('o 29 de fevereiro não escorrega para março', async () => {
    const { useCase, vendasPorTipo } = montar([]);

    await useCase.porTipo(
      undefined,
      new Date(2024, 1, 1),
      new Date(2024, 1, 29),
      true,
      AGORA,
    );

    const [, anterior] = vendasPorTipo.mock.calls[0];
    expect(anterior.ate.getMonth()).toBe(1);
    expect(anterior.ate.getDate()).toBe(28);
  });

  it('comparando, cada linha traz os dois números', async () => {
    const { useCase } = montar([
      linha({ codigoErp: 'CO', quantidade: 118, quantidadeAnterior: 144 }),
    ]);

    const r = await useCase.porTipo('ANO', undefined, undefined, true, AGORA);

    expect(r.linhas[0]).toMatchObject({
      quantidade: 118,
      quantidadeAnterior: 144,
    });
    expect(r.totalDeJoiaAnterior).toBe(144);
    expect(r.ano).toBe('2026');
    expect(r.anoAnterior).toBe('2025');
  });

  /**
   * O ANO VIAJA NA RESPOSTA — 16/11/2026, pedido do Lucas no teste local:
   * *"seria interessante trazer o ano.. aqui eu me perdi e não sei quem é
   * quem"*. Ele leu "119 contra 146" e não soube qual era qual.
   */
  it('sem comparar, só o ano da janela, e nenhum anterior', async () => {
    const { useCase } = montar([]);

    const r = await useCase.porTipo('ANO', undefined, undefined, false, AGORA);

    expect(r.ano).toBe('2026');
    expect(r.anoAnterior).toBeNull();
  });

  /** Janela que atravessa a virada não vira um ano só — seria mentira. */
  it('a janela que atravessa o ano vira 2025/2026', async () => {
    const { useCase } = montar([]);

    const r = await useCase.porTipo(
      undefined,
      new Date(2025, 11, 1),
      new Date(2026, 0, 31),
      true,
      AGORA,
    );

    expect(r.ano).toBe('2025/2026');
    expect(r.anoAnterior).toBe('2024/2025');
  });

  /**
   * UM TIPO QUE SÓ VENDEU NO ANO PASSADO PRECISA APARECER — senão a resposta
   * "caiu em todos os tipos" esconde justamente o que caiu a zero.
   */
  it('o tipo que vendeu só no ano anterior continua na lista', async () => {
    const { useCase } = montar([
      linha({
        codigoErp: 'PU',
        familia: 'PULSEIRA',
        quantidade: 0,
        quantidadeAnterior: 72,
      }),
    ]);

    const r = await useCase.porTipo('ANO', undefined, undefined, true, AGORA);

    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({
      tipo: 'Pulseira',
      quantidade: 0,
      quantidadeAnterior: 72,
    });
  });

  it('período sem venda devolve a lista vazia', async () => {
    const { useCase } = montar([]);

    const r = await useCase.porTipo('HOJE', undefined, undefined, false, AGORA);

    expect(r).toEqual({
      linhas: [],
      totalDeJoia: 0,
      totalDeJoiaAnterior: 0,
      comparando: false,
      ano: '2026',
      anoAnterior: null,
      periodo: 'de 25/09/2026 a 25/09/2026',
    });
  });
});

/**
 * A QUEBRA POR PEDRA — 16/11/2026.
 *
 * UMA PEÇA COM DUAS PEDRAS CONTA NAS DUAS, e é deliberado: a pergunta é
 * "quanto saiu de esmeralda", e um colar com esmeralda e diamante saiu com
 * esmeralda. O preço disso é que a soma das linhas passa do número de peças
 * — medido em 2026, 404 contra 337 —, e por isso a contagem de peças viaja
 * junto, para a agente poder explicar.
 */
describe('a quebra por pedra', () => {
  const AGORA = new Date(2026, 8, 25, 14, 30, 0);

  function montar(cruas: unknown[]) {
    const vendasPorPedra = jest.fn().mockResolvedValue(cruas);
    const useCase = new ConsultarVendasUseCase({
      vendasPorPedra,
    } as unknown as IVendasMovimentacaoRepository);
    return { useCase, vendasPorPedra };
  }

  it('a peça com duas pedras conta nas duas', async () => {
    const { useCase } = montar([
      {
        tipoPedra: 'ESM',
        etiqueta: 'COLAR ESM 5.31 CT DTS 13.46 OB 18K',
        quantidade: 1,
        valor: 220307,
      },
    ]);

    const r = await useCase.porPedra();

    expect(r.linhas.map((l) => l.pedra).sort()).toEqual([
      'Diamante',
      'Esmeralda',
    ]);
    expect(r.pecasComPedra).toBe(1);
  });

  it('a peça sem pedra não vira linha, mas é contada', async () => {
    const { useCase } = montar([
      {
        tipoPedra: null,
        etiqueta: 'COLAR CORRENTE CARTIER OA 18K 4.0G',
        quantidade: 5,
        valor: 50,
      },
      {
        tipoPedra: null,
        etiqueta: 'ANEL DTS 3.01 CTS OB 18K',
        quantidade: 2,
        valor: 20,
      },
    ]);

    const r = await useCase.porPedra();

    expect(r.linhas).toEqual([
      { pedra: 'Diamante', quantidade: 2, valor: 20, quantidadeAnterior: 0 },
    ]);
    expect(r.pecasComPedra).toBe(2);
    expect(r.pecasSemPedra).toBe(5);
  });

  it('ordena da pedra que mais saiu para a que menos saiu', async () => {
    const { useCase } = montar([
      { tipoPedra: null, etiqueta: 'ANEL ESM', quantidade: 28, valor: 1 },
      { tipoPedra: null, etiqueta: 'ANEL DTS', quantidade: 305, valor: 2 },
      { tipoPedra: null, etiqueta: 'ANEL TQ', quantidade: 8, valor: 3 },
    ]);

    const r = await useCase.porPedra();

    expect(r.linhas.map((l) => l.pedra)).toEqual([
      'Diamante',
      'Esmeralda',
      'Turquesa',
    ]);
  });

  it('o período em datas chega ao repositório com o fim do dia', async () => {
    const { useCase, vendasPorPedra } = montar([]);

    await useCase.porPedra(
      undefined,
      new Date(2026, 7, 1),
      new Date(2026, 7, 31),
      false,
      AGORA,
    );

    const [janela] = vendasPorPedra.mock.calls[0];
    expect(janela.de).toEqual(new Date(2026, 7, 1));
    expect(janela.ate).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });
});

/**
 * O CONSERTO DO `quem_mais_vende` — 16/11/2026, aprovado pelo Lucas:
 * *"sim, ajusta isso. Importante está com os números atualizado."*
 *
 * ==========================================================================
 * ELE RESPONDIA 108 COLARES ONDE A VERDADE SÃO 118.
 *
 * Casava por igualdade na `familia`, e os colares RIVEIRA e SOLITARIO —
 * estilo cadastrado no lugar do tipo — ficavam de fora. Agora a palavra vira
 * PREFIXO quando é tipo de joia, e a `familia` continua valendo para o resto.
 *
 * NÃO É ADIÇÃO PURA: o número que a agente responde muda. É o motivo de isto
 * estar documentado aqui e no plano, e não só no commit.
 * ==========================================================================
 */
describe('o ranking por tipo de peça', () => {
  const AGORA = new Date(2026, 8, 25, 14, 30, 0);

  function montar() {
    const rankingPorFamilia = jest.fn().mockResolvedValue([]);
    const rankingPorFamiliaNoMes = jest.fn().mockResolvedValue([]);
    const useCase = new ConsultarVendasUseCase({
      rankingPorFamilia,
      rankingPorFamiliaNoMes,
    } as unknown as IVendasMovimentacaoRepository);
    return { useCase, rankingPorFamilia, rankingPorFamiliaNoMes };
  }

  it('colar vira os prefixos CO e EX', async () => {
    const { useCase, rankingPorFamilia } = montar();

    await useCase.porFamilia('colar', 'MES', 10, AGORA);

    const [, familia, prefixos] = rankingPorFamilia.mock.calls[0];
    expect(familia).toBe('colar');
    expect(prefixos).toEqual(['CO', 'EX']);
  });

  /**
   * RIVIERA CONTINUA CASANDO PELA `familia`, e é o que preserva o que já
   * funcionava: "quantas rivieras vendemos" é pergunta de ESTILO.
   */
  it('riviera não vira prefixo nenhum', async () => {
    const { useCase, rankingPorFamilia } = montar();

    await useCase.porFamilia('riviera', 'MES', 10, AGORA);

    const [, , prefixos] = rankingPorFamilia.mock.calls[0];
    expect(prefixos).toBeNull();
  });

  it('o vaso também segue pela família', async () => {
    const { useCase, rankingPorFamilia } = montar();

    await useCase.porFamiliaEntre('vaso', new Date(2026, 0, 1), new Date(2026, 0, 31), 10);

    const [, , prefixos] = rankingPorFamilia.mock.calls[0];
    expect(prefixos).toBeNull();
  });

  it('o recorte por mês também recebe os prefixos', async () => {
    const { useCase, rankingPorFamiliaNoMes } = montar();

    await useCase.porFamiliaNoMes('brinco', 10, 1);

    const [mes, familia, prefixos] = rankingPorFamiliaNoMes.mock.calls[0];
    expect(mes).toBe(10);
    expect(familia).toBe('brinco');
    expect(prefixos).toEqual(['BR']);
  });
});

/**
 * COMPARAR A PEDRA ENTRE ANOS, E QUEM VENDEU CADA UMA — 16/11/2026.
 *
 * ==========================================================================
 * AS DUAS NASCERAM DO TESTE LOCAL, NA MESMA CONVERSA.
 *
 * O Lucas perguntou *"quem vendeu mais diamante esse ano?"* e a Anastasia
 * respondeu com honestidade que não conseguia — *"diamante conta no ranking
 * de peças pelo tipo da joia, não pela pedra"*. E pediu as duas: *"comparar
 * a pedra com outros anos; quais vendedoras venderam mais um tipo de pedra"*.
 *
 * A PEDRA NÃO É COLUNA: ela sai do dicionário, aqui no caso de uso, lendo
 * `tipo_pedra` e a etiqueta. Por isso o SQL não filtra por pedra — ele traz
 * a quebra por vendedora e o filtro acontece depois.
 * ==========================================================================
 */
describe('a pedra comparada entre anos', () => {
  const AGORA = new Date(2026, 8, 25, 14, 30, 0);

  function montar(cruas: unknown[]) {
    const vendasPorPedra = jest.fn().mockResolvedValue(cruas);
    const useCase = new ConsultarVendasUseCase({
      vendasPorPedra,
    } as unknown as IVendasMovimentacaoRepository);
    return { useCase, vendasPorPedra };
  }

  it('comparando, cada pedra traz os dois anos', async () => {
    const { useCase } = montar([
      {
        tipoPedra: null,
        etiqueta: 'ANEL DTS',
        quantidade: 305,
        valor: 10,
        quantidadeAnterior: 280,
        valorAnterior: 9,
      },
    ]);

    const r = await useCase.porPedra('ANO', undefined, undefined, true, AGORA);

    expect(r.linhas[0]).toMatchObject({
      pedra: 'Diamante',
      quantidade: 305,
      quantidadeAnterior: 280,
    });
    expect(r.ano).toBe('2026');
    expect(r.anoAnterior).toBe('2025');
    expect(r.comparando).toBe(true);
  });

  it('sem comparar, nenhum ano anterior é pedido', async () => {
    const { useCase, vendasPorPedra } = montar([]);

    await useCase.porPedra('ANO', undefined, undefined, false, AGORA);

    const [, anterior] = vendasPorPedra.mock.calls[0];
    expect(anterior).toBeUndefined();
  });

  /**
   * A PEDRA QUE SÓ VENDEU NO ANO PASSADO PRECISA APARECER — é justamente a
   * linha que responde "a esmeralda sumiu?".
   */
  it('a pedra que vendeu só no ano anterior continua na lista', async () => {
    const { useCase } = montar([
      {
        tipoPedra: 'ESM',
        etiqueta: 'ANEL',
        quantidade: 0,
        valor: 0,
        quantidadeAnterior: 12,
        valorAnterior: 500,
      },
    ]);

    const r = await useCase.porPedra('ANO', undefined, undefined, true, AGORA);

    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({
      pedra: 'Esmeralda',
      quantidade: 0,
      quantidadeAnterior: 12,
    });
  });
});

describe('quem vendeu mais uma pedra', () => {
  const AGORA = new Date(2026, 8, 25, 14, 30, 0);

  function montar(cruas: unknown[]) {
    const vendasPorPedra = jest.fn().mockResolvedValue(cruas);
    const useCase = new ConsultarVendasUseCase({
      vendasPorPedra,
    } as unknown as IVendasMovimentacaoRepository);
    return { useCase, vendasPorPedra };
  }

  const cru = (p: Record<string, unknown>) => ({
    vendedoraId: 'v1',
    vendedora: 'CAMILA',
    tipoPedra: null,
    etiqueta: 'ANEL DTS 1.0 CTS',
    quantidade: 1,
    valor: 100,
    quantidadeAnterior: 0,
    valorAnterior: 0,
    ...p,
  });

  it('ranqueia as vendedoras daquela pedra', async () => {
    const { useCase, vendasPorPedra } = montar([
      cru({ vendedoraId: 'v1', vendedora: 'CAMILA', quantidade: 56, valor: 2000 }),
      cru({ vendedoraId: 'v2', vendedora: 'BIANCA', quantidade: 27, valor: 1000 }),
      cru({ vendedoraId: 'v3', vendedora: 'YLKA', etiqueta: 'ANEL ESM', quantidade: 99, valor: 1 }),
    ]);

    const r = await useCase.quemVendeuPedra('diamante', 'ANO', undefined, undefined, 10, AGORA);

    expect(r.status).toBe('OK');
    expect(r.pedra).toBe('Diamante');
    expect(r.linhas).toEqual([
      { nome: 'CAMILA', quantidade: 56, valor: 2000 },
      { nome: 'BIANCA', quantidade: 27, valor: 1000 },
    ]);
    // A quebra por vendedora tem de ter sido PEDIDA ao repositório.
    expect(vendasPorPedra.mock.calls[0][2]).toBe(true);
  });

  it('o nome com acento e no plural também encontra', async () => {
    const { useCase } = montar([
      cru({ vendedora: 'CAMILA', etiqueta: 'COLAR PER 8MM', quantidade: 3, valor: 30 }),
    ]);

    const r = await useCase.quemVendeuPedra('pérolas', 'ANO', undefined, undefined, 10, AGORA);

    expect(r.status).toBe('OK');
    expect(r.pedra).toBe('Perola');
    expect(r.linhas[0].quantidade).toBe(3);
  });

  /**
   * O NOME DESCONHECIDO VIRA PERGUNTA, E NÃO BECO — é o mesmo caminho do
   * `quem_mais_vende` quando a família não existe.
   */
  it('o nome que não é pedra devolve a lista', async () => {
    const { useCase, vendasPorPedra } = montar([]);

    const r = await useCase.quemVendeuPedra('brilhante', 'ANO', undefined, undefined, 10, AGORA);

    expect(r.status).toBe('PEDRA_DESCONHECIDA');
    expect(r.linhas).toEqual([]);
    expect(r.pedras).toContain('diamante');
    expect(r.pedras).toContain('esmeralda');
    // Nem consultou o banco: o nome já não existia.
    expect(vendasPorPedra).not.toHaveBeenCalled();
  });

  it('a peça com duas pedras conta para a vendedora nas duas', async () => {
    const { useCase } = montar([
      cru({
        vendedora: 'CAMILA',
        tipoPedra: 'ESM',
        etiqueta: 'COLAR ESM 5.31 CT DTS 13.46',
        quantidade: 1,
        valor: 220307,
      }),
    ]);

    const comDiamante = await useCase.quemVendeuPedra('diamante', 'ANO', undefined, undefined, 10, AGORA);
    const comEsmeralda = await useCase.quemVendeuPedra('esmeralda', 'ANO', undefined, undefined, 10, AGORA);

    expect(comDiamante.linhas[0].quantidade).toBe(1);
    expect(comEsmeralda.linhas[0].quantidade).toBe(1);
  });

  /** Movimentação sem vendedora existe (2 em 1.414) e não vira linha. */
  it('a venda sem vendedora fica de fora do ranking', async () => {
    const { useCase } = montar([
      cru({ vendedoraId: null, vendedora: null, quantidade: 9, valor: 1 }),
      cru({ vendedoraId: 'v1', vendedora: 'CAMILA', quantidade: 2, valor: 1 }),
    ]);

    const r = await useCase.quemVendeuPedra('diamante', 'ANO', undefined, undefined, 10, AGORA);

    expect(r.linhas).toEqual([{ nome: 'CAMILA', quantidade: 2, valor: 1 }]);
  });

  it('o limite corta a lista', async () => {
    const { useCase } = montar([
      cru({ vendedoraId: 'v1', vendedora: 'A', quantidade: 3, valor: 3 }),
      cru({ vendedoraId: 'v2', vendedora: 'B', quantidade: 2, valor: 2 }),
      cru({ vendedoraId: 'v3', vendedora: 'C', quantidade: 1, valor: 1 }),
    ]);

    const r = await useCase.quemVendeuPedra('diamante', 'ANO', undefined, undefined, 2, AGORA);

    expect(r.linhas.map((l) => l.nome)).toEqual(['A', 'B']);
  });
});

/**
 * A RESPOSTA DIZ QUE PERÍODO ELA CONSULTOU — 16/11/2026.
 *
 * ==========================================================================
 * NASCEU DE UM NÚMERO FALSO NA FRENTE DO LUCAS.
 *
 * No teste local ele perguntou *"quem vendeu mais pérola?"*. O modelo chamou
 * a ferramenta com `periodo: 'MES'` — por conta própria, porque a irmã
 * `quem_mais_vende` documenta MES como padrão —, o mês corrente não tem
 * venda nenhuma (a movimentação está parada desde 05/11), e a resposta vazia
 * dizia só *"ninguém vendeu nesse período"*.
 *
 * O modelo preencheu o buraco: *"nenhuma venda de pérola aparece em 2026
 * ainda"*. E em 2026 havia três vendedoras com pérola.
 *
 * NÃO FOI O MODELO QUE MENTIU: foi a ferramenta que devolveu um vazio sem
 * dizer de quando. Quem não diz o recorte convida a invenção.
 * ==========================================================================
 */
describe('o período que a resposta consultou', () => {
  const AGORA = new Date(2026, 8, 25, 14, 30, 0);

  function montarTipo() {
    const vendasPorTipo = jest.fn().mockResolvedValue([]);
    return {
      useCase: new ConsultarVendasUseCase({
        vendasPorTipo,
      } as unknown as IVendasMovimentacaoRepository),
    };
  }

  function montarPedra() {
    const vendasPorPedra = jest.fn().mockResolvedValue([]);
    return {
      useCase: new ConsultarVendasUseCase({
        vendasPorPedra,
      } as unknown as IVendasMovimentacaoRepository),
    };
  }

  it('sem janela, diz que foi o histórico inteiro', async () => {
    const { useCase } = montarTipo();

    const r = await useCase.porTipo();

    expect(r.periodo).toBe('o histórico inteiro');
  });

  it('com datas, diz as duas pontas', async () => {
    const { useCase } = montarTipo();

    const r = await useCase.porTipo(
      undefined,
      new Date(2026, 0, 1),
      new Date(2026, 10, 16),
      false,
      AGORA,
    );

    expect(r.periodo).toBe('de 01/01/2026 a 16/11/2026');
  });

  /** O mês corrente é exatamente o recorte que produziu o número falso. */
  it('o mês corrente diz o dia 1 e o dia de hoje', async () => {
    const { useCase } = montarPedra();

    const r = await useCase.quemVendeuPedra(
      'perola',
      'MES',
      undefined,
      undefined,
      10,
      AGORA,
    );

    expect(r.periodo).toBe('de 01/09/2026 a 25/09/2026');
  });

  it('a quebra por pedra também diz', async () => {
    const { useCase } = montarPedra();

    const r = await useCase.porPedra('ANO', undefined, undefined, false, AGORA);

    expect(r.periodo).toBe('de 01/01/2026 a 25/09/2026');
  });

  /**
   * A DATA É ESCRITA À MÃO, e não com `toLocaleDateString`: o container é
   * Alpine e o ICU do Node já mordeu este projeto antes. É a mesma razão dos
   * doze meses por extenso do `ferramentas-gestao.service`.
   */
  it('o dia e o mês saem com dois dígitos', async () => {
    const { useCase } = montarTipo();

    const r = await useCase.porTipo(
      undefined,
      new Date(2026, 1, 3),
      new Date(2026, 1, 9),
      false,
      AGORA,
    );

    expect(r.periodo).toBe('de 03/02/2026 a 09/02/2026');
  });
});

/**
 * O RECORTE DE VENDEDORAS NAS QUEBRAS — 17/11/2026.
 *
 * ==========================================================================
 * UM FILTRO, TRES CHAMADORES.
 *
 * A loja manda `null`, a gerente de vendas manda a equipe dela, e a vendedora
 * manda o proprio id. As quatro quebras passam a aceitar o recorte, e quem
 * decide o que passa e quem monta as ferramentas — nunca o modelo.
 *
 * `[]` E NINGUEM, NAO TODOS. A distincao vem do
 * `vendedorasDaEquipeDoUsuario`, que usa duas consultas em vez de um JOIN
 * exatamente para nao perder a diferenca entre "sem equipe" e "equipe vazia".
 * Se `[]` virasse `null` no caminho, uma gerente de equipe vazia receberia a
 * loja inteira.
 * ==========================================================================
 */
describe('o recorte de vendedoras nas quebras', () => {
  const AGORA = new Date(2026, 8, 25, 14, 30, 0);
  const TIME = ['v1', 'v2', 'v3'];

  function montar() {
    const vendasPorTipo = jest.fn().mockResolvedValue([]);
    const vendasPorPedra = jest.fn().mockResolvedValue([]);
    const vendasPorMetal = jest.fn().mockResolvedValue([]);
    const useCase = new ConsultarVendasUseCase({
      vendasPorTipo,
      vendasPorPedra,
      vendasPorMetal,
    } as unknown as IVendasMovimentacaoRepository);
    return { useCase, vendasPorTipo, vendasPorPedra, vendasPorMetal };
  }

  it('a quebra por tipo leva o recorte', async () => {
    const { useCase, vendasPorTipo } = montar();

    await useCase.porTipo('ANO', undefined, undefined, false, AGORA, TIME);

    expect(vendasPorTipo.mock.calls[0][2]).toEqual(TIME);
  });

  it('a quebra por pedra leva o recorte', async () => {
    const { useCase, vendasPorPedra } = montar();

    await useCase.porPedra('ANO', undefined, undefined, false, AGORA, TIME);

    expect(vendasPorPedra.mock.calls[0][3]).toEqual(TIME);
  });

  it('a quebra por metal leva o recorte', async () => {
    const { useCase, vendasPorMetal } = montar();

    await useCase.porMetal('ANO', undefined, undefined, AGORA, TIME);

    expect(vendasPorMetal.mock.calls[0][1]).toEqual(TIME);
  });

  it('o ranking de uma pedra leva o recorte', async () => {
    const { useCase, vendasPorPedra } = montar();

    await useCase.quemVendeuPedra(
      'diamante',
      'ANO',
      undefined,
      undefined,
      10,
      AGORA,
      TIME,
    );

    expect(vendasPorPedra.mock.calls[0][3]).toEqual(TIME);
  });

  it('sem recorte, as quatro mandam null', async () => {
    const { useCase, vendasPorTipo, vendasPorPedra, vendasPorMetal } = montar();

    await useCase.porTipo('ANO', undefined, undefined, false, AGORA);
    await useCase.porPedra('ANO', undefined, undefined, false, AGORA);
    await useCase.porMetal('ANO', undefined, undefined, AGORA);
    await useCase.quemVendeuPedra(
      'diamante',
      'ANO',
      undefined,
      undefined,
      10,
      AGORA,
    );

    expect(vendasPorTipo.mock.calls[0][2]).toBeNull();
    expect(vendasPorPedra.mock.calls[0][3]).toBeNull();
    expect(vendasPorMetal.mock.calls[0][1]).toBeNull();
    expect(vendasPorPedra.mock.calls[1][3]).toBeNull();
  });

  /**
   * O TESTE QUE IMPEDE O VAZAMENTO: se a lista vazia escorregasse para `null`
   * em qualquer ponto do caminho, uma gerente de equipe vazia receberia a
   * loja inteira — e a resposta pareceria perfeitamente correta.
   */
  it('a lista vazia continua vazia, e nao vira a loja', async () => {
    const { useCase, vendasPorTipo } = montar();

    await useCase.porTipo('ANO', undefined, undefined, false, AGORA, []);

    expect(vendasPorTipo.mock.calls[0][2]).toEqual([]);
    expect(vendasPorTipo.mock.calls[0][2]).not.toBeNull();
  });
});

/**
 * O VALOR DAS VENDAS, SEM A LISTA — 17/11/2026.
 *
 * ==========================================================================
 * "VALOR DAS VENDAS DESSE MÊS" É DIFERENTE DE "QUAIS AS VENDAS DESSE MÊS".
 *
 * O Lucas colou uma conversa da gestão em que ela pediu o total quatro vezes
 * e levou as 25 linhas quatro vezes. A causa não era o modelo insistir: é que
 * **não existia ferramenta** para o valor da loja sem lista.
 *
 *   `vendas_detalhadas`    → lista + total, e a tabela sai como efeito
 *   `vendas_de_vendedora`  → três números, mas `required: ['vendedora']`
 *   `consultar_vendas`     → é da própria vendedora, pelo telefone
 *
 * Sem nome de vendedora, o único caminho era a lista.
 *
 * E OS DOIS NÚMEROS NÃO BATEM, o que fecha o desenho: a lista não desconta
 * devolução e o resumo desconta. Na mesma conversa saíram R$ 1.837.916,80 e
 * R$ 1.815.870,80 — R$ 22.046 de diferença, e a gestora sem como saber por
 * quê. Por isso esta resposta leva OS DOIS LADOS rotulados.
 * ==========================================================================
 */
describe('o valor das vendas, sem a lista', () => {
  const AGORA = new Date(2026, 10, 17, 10, 0, 0);

  const RESUMO = {
    quantidade: 25,
    receita: 1815870.8,
    ticketMedio: 72634.83,
    devolucoes: 1,
    valorDevolvido: 22046,
    clientes: 23,
  };

  function montar(resumo = RESUMO) {
    const chamadas: unknown[][] = [];
    const repo = {
      resumo: jest.fn(async (...args: unknown[]) => {
        chamadas.push(args);
        return resumo;
      }),
    };
    return {
      useCase: new ConsultarVendasUseCase(
        repo as unknown as IVendasMovimentacaoRepository,
      ),
      chamadas,
    };
  }

  it('devolve os dois lados, e o bruto é a soma de volta', async () => {
    const { useCase } = montar();

    const r = await useCase.valorDasVendas('MES', undefined, undefined, AGORA);

    expect(r.quantidade).toBe(25);
    expect(r.receita).toBe(1815870.8);
    expect(r.devolucoes).toBe(1);
    expect(r.valorDevolvido).toBe(22046);
    // O BRUTO é o que a lista mostra: receita + o que voltou.
    expect(r.bruto).toBeCloseTo(1837916.8, 2);
    // ====================================================================
    // O TICKET DIVIDE O BRUTO — 18/11/2026, e não a receita.
    //
    // O `resumo` do repositório devolve 72.634,83, que é a receita líquida
    // dividida por 25, e é o que a tela de Vendas mostra. Aqui a resposta é
    // a VENDA LIMPA, então o ticket tem de ser dela: senão a própria
    // resposta não fecha — quem dividir 1.837.916,80 por 25 acha 73.516,67
    // onde estaria escrito 72.634,83.
    // ====================================================================
    expect(r.ticketMedio).toBeCloseTo(1837916.8 / 25, 2);
  });

  it('diz o período que consultou', async () => {
    const { useCase } = montar();

    const r = await useCase.valorDasVendas('MES', undefined, undefined, AGORA);

    expect(r.periodo).toBe('de 01/11/2026 a 17/11/2026');
  });

  it('o período em datas chega com o fim do dia', async () => {
    const { useCase, chamadas } = montar();

    await useCase.valorDasVendas(
      undefined,
      new Date(2026, 10, 1),
      new Date(2026, 10, 16),
      AGORA,
    );

    const [janela] = chamadas[0] as [{ de: Date; ate: Date }];
    expect(janela.de).toEqual(new Date(2026, 10, 1));
    expect(janela.ate).toEqual(new Date(2026, 10, 16, 23, 59, 59, 999));
  });

  /** O recorte de vendedoras é o MESMO das quebras: loja, equipe ou uma. */
  it('leva o recorte de vendedoras', async () => {
    const { useCase, chamadas } = montar();

    await useCase.valorDasVendas('MES', undefined, undefined, AGORA, [
      'v1',
      'v2',
    ]);

    expect(chamadas[0][2]).toEqual(['v1', 'v2']);
  });

  it('sem recorte, manda null', async () => {
    const { useCase, chamadas } = montar();

    await useCase.valorDasVendas('MES', undefined, undefined, AGORA);

    expect(chamadas[0][2]).toBeNull();
  });

  it('período sem venda nenhuma devolve zeros, e não erro', async () => {
    const { useCase } = montar({
      quantidade: 0,
      receita: 0,
      ticketMedio: 0,
      devolucoes: 0,
      valorDevolvido: 0,
      clientes: 0,
    });

    const r = await useCase.valorDasVendas('HOJE', undefined, undefined, AGORA);

    expect(r.quantidade).toBe(0);
    expect(r.bruto).toBe(0);
  });
});
