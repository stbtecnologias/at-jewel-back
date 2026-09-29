import { FerramentasGestaoService, moeda } from './ferramentas-gestao.service';

/**
 * O ESCOPO ESTREITO DA GESTAO — 28/09/2026.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE: QUEM GERENCIA AS VENDEDORAS NAO VE A LOJA.
 *
 * Pedido do Lucas: uma gerente das vendedoras, que ve desempenho, metas,
 * agenda e catalogo da equipe, e NAO ve o faturamento geral.
 *
 * Das 17 ferramentas da gestao, dezesseis falam de UMA vendedora ou nao falam
 * de dinheiro. So o `itens_mais_vendidos` responde sobre a loja inteira, em
 * valor, quando a vendedora e omitida — entao e a unica que muda, e o que
 * muda e a obrigatoriedade do nome.
 *
 * O padrao de `verLoja` e FALSO de proposito: quem esquecer de informar perde
 * uma resposta, e nao abre o faturamento. O primeiro teste guarda exatamente
 * isso, e ele quebra se alguem inverter o default por conveniencia.
 * ==========================================================================
 */

const MARINA = {
  status: 'OK' as const,
  id: 'vd-1',
  nome: 'Marina',
  codigoErp: 'SEED-VD01',
};

describe('itens_mais_vendidos e o escopo de quem pergunta', () => {
  let resolverVendedora: { execute: jest.Mock };
  let consultarVendas: { itens: jest.Mock };
  let listarProdutos: { execute: jest.Mock };
  let servico: FerramentasGestaoService;

  beforeEach(() => {
    resolverVendedora = { execute: jest.fn().mockResolvedValue(MARINA) };
    listarProdutos = {
      execute: jest.fn().mockResolvedValue([
        {
          descricaoEtiqueta: 'Anel solitário',
          categoria: 'JOIAS',
          familia: 'ANEL',
          codigoErp: 'AN25258',
          valorVenda: 17490,
          estoqueAtual: 4,
        },
      ]),
    };
    consultarVendas = {
      itens: jest.fn().mockResolvedValue({
        linhas: [
          {
            codigoErp: 'AN25258',
            descricao: 'Anel solitario',
            familia: 'ANEL',
            valor: 17490,
            quantidade: 1,
          },
        ],
      }),
    };

    servico = new FerramentasGestaoService(
      resolverVendedora as never,
      consultarVendas as never,
      // As metricas de atendimento (ANA-08 a 12, 29/09) — dubladas: estes
      // testes descrevem o roteamento das ferramentas, nao o SQL.
      { execute: jest.fn().mockResolvedValue({
        de: new Date(), ate: new Date(),
        leadsPorVendedora: [], interacoesPorVendedora: [],
        primeiraResposta: { minutos: null, amostra: 0, minimo: null, maximo: null },
        duracaoDoAtendimento: { minutos: null, amostra: 0, minimo: null, maximo: null },
        ateFecharVenda: { minutos: null, amostra: 0, minimo: null, maximo: null },
      }) } as never,
      // Rankings (ANA-14, 29/09) — dublados.
      { execute: jest.fn().mockResolvedValue({
        de: new Date(), ate: new Date(),
        respondeMaisRapido: [], fechaMaisRapido: [], maisInterage: [],
        maisConverte: [], maisLeads: [], semAmostra: [],
      }) } as never,
      // Análise de tom (ANA-15, 29/09) — dublada.
      { execute: jest.fn().mockResolvedValue({ status: 'SEM_CONVERSA' }) } as never,
      // Comparação ano a ano (29/09) — dublada.
      { porMes: jest.fn().mockResolvedValue({ rotulo: "x", cortadoNoDia: null, anos: [] }),
        porPeriodo: jest.fn().mockResolvedValue({ rotulo: "x", cortadoNoDia: null, anos: [] }) } as never,
      // Comparação com o período anterior (29/09) — dublada.
      { porRecorte: jest.fn().mockResolvedValue({ rotulo: "x", atual: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anterior: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anteriorFechado: null }),
        porDatas: jest.fn().mockResolvedValue({ rotulo: "x", atual: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anterior: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anteriorFechado: null }) } as never,
      // ConexoesService e WahaAdminClient (29/09) — dublados. O `catch`
      // do handler faz a lista sair mesmo sem WAHA, e e isso que o
      // `mockRejectedValue` exercita nos testes que nao ligam para conexao.
      { vendedoraDaSessao: (s: string) => s.replace(/^vend-/, "") } as never,
      { listarSessoes: jest.fn().mockResolvedValue([]) } as never,
      listarProdutos as never,
      { execute: jest.fn() } as never,
      { vendas: jest.fn(), metas: jest.fn() } as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), detalhe: jest.fn(), resumo: jest.fn() } as never,
      { doDia: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), buscarPorId: jest.fn() } as never,
      { buscarPorNomeParcial: jest.fn() } as never,
      { listarAguardandoGestao: jest.fn() } as never,
      // O ponteiro de conversas vivas (29/09) — dublado: estes testes
      // descrevem o roteamento das ferramentas, nao a consulta.
      { entre: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  describe('sem ver a loja (GERENTE_VENDAS)', () => {
    it('o padrao do montar ja e o escopo estreito — esquecer nao abre nada', () => {
      expect(servico.montar().gestaoItensExigeVendedora).toBe(true);
      expect(servico.montar({}).gestaoItensExigeVendedora).toBe(true);
      expect(
        servico.montar({ solicitante: 'Fernanda' }).gestaoItensExigeVendedora,
      ).toBe(true);
    });

    it('sem vendedora, NAO consulta — e pede o nome, em vez de dizer que nao achou', async () => {
      const r = await servico
        .montar({ verLoja: false })
        .gestaoItens({ periodo: 'MES' });

      expect(r.status).toBe('EXIGE_VENDEDORA');
      // O ponto do teste: o SQL da loja nao chega a rodar. Recusar depois de
      // consultar deixaria o dado carregado em memoria, a um `return` de
      // distancia de vazar numa refatoracao.
      expect(consultarVendas.itens).not.toHaveBeenCalled();
    });

    it('vendedora em branco conta como ausente', async () => {
      const r = await servico
        .montar({ verLoja: false })
        .gestaoItens({ periodo: 'MES', vendedora: '   ' });

      expect(r.status).toBe('EXIGE_VENDEDORA');
      expect(consultarVendas.itens).not.toHaveBeenCalled();
    });

    it('COM vendedora responde normalmente, recortado nela', async () => {
      const r = await servico
        .montar({ verLoja: false })
        .gestaoItens({ periodo: 'MES', vendedora: 'Marina' });

      expect(r.status).toBe('OK');
      expect(r.linhas[0]).toContain('Anel solitario');
      // O terceiro argumento e o recorte: o id da vendedora resolvida, nunca
      // `null` — que aqui significaria a loja.
      expect(consultarVendas.itens).toHaveBeenCalledWith('MES', 10, 'vd-1');
    });
  });

  describe('vendo a loja (ADMIN, GERENTE, SUPERADMIN)', () => {
    it('sem vendedora, responde pela loja', async () => {
      const r = await servico
        .montar({ verLoja: true })
        .gestaoItens({ periodo: 'MES' });

      expect(r.status).toBe('OK');
      expect(consultarVendas.itens).toHaveBeenCalledWith('MES', 10, null);
    });

    it('avisa o cliente do LLM que a tool NAO precisa exigir vendedora', () => {
      expect(
        servico.montar({ verLoja: true }).gestaoItensExigeVendedora,
      ).toBe(false);
    });
  });
});

/**
 * A QUANTIDADE POR PECA NA CONSULTA DE CATALOGO — 28/09/2026.
 *
 * ==========================================================================
 * ISTO REVERTE UMA DECISAO DE 25/09, E A REVERSAO E O PONTO.
 *
 * Naquele dia ficou "a gestao pode ver o numero", valendo para todo mundo que
 * entrasse no canal. O documento de requisitos de 28/09 desfez na pendencia
 * P-04, e o Lucas confirmou: a gerente "tem que entender se a peca que ela
 * quer esta disponivel no estoque e quanto e o preco de venda. Ela nao precisa
 * saber de quantidade".
 *
 * Quem mexer aqui procurando o historico: a decisao velha esta em 25/09, a
 * nova em 28/09, e a chave e `estoque:quantidade` — a MESMA da API de
 * produtos, para nao existirem dois criterios para a mesma pergunta.
 * ==========================================================================
 */
describe('consultar_produtos da gestao e a quantidade', () => {
  let listarProdutos: { execute: jest.Mock };
  let servico: FerramentasGestaoService;

  const comEstoque = (estoqueAtual: number) => {
    listarProdutos.execute.mockResolvedValue([
      {
        descricaoEtiqueta: 'Anel solitário',
        categoria: 'JOIAS',
        familia: 'ANEL',
        codigoErp: 'AN25258',
        valorVenda: 17490,
        estoqueAtual,
      },
    ]);
  };

  beforeEach(() => {
    listarProdutos = { execute: jest.fn() };
    servico = new FerramentasGestaoService(
      { execute: jest.fn() } as never,
      // Metricas de atendimento (ANA-08 a 12, 29/09) — dubladas.
      { execute: jest.fn().mockResolvedValue({
        de: new Date(), ate: new Date(),
        leadsPorVendedora: [], interacoesPorVendedora: [],
        primeiraResposta: { minutos: null, amostra: 0, minimo: null, maximo: null },
        duracaoDoAtendimento: { minutos: null, amostra: 0, minimo: null, maximo: null },
        ateFecharVenda: { minutos: null, amostra: 0, minimo: null, maximo: null },
      }) } as never,
      // Rankings (ANA-14, 29/09) — dublados.
      { execute: jest.fn().mockResolvedValue({
        de: new Date(), ate: new Date(),
        respondeMaisRapido: [], fechaMaisRapido: [], maisInterage: [],
        maisConverte: [], maisLeads: [], semAmostra: [],
      }) } as never,
      // Análise de tom (ANA-15, 29/09) — dublada.
      { execute: jest.fn().mockResolvedValue({ status: 'SEM_CONVERSA' }) } as never,
      // Comparação ano a ano (29/09) — dublada.
      { porMes: jest.fn().mockResolvedValue({ rotulo: "x", cortadoNoDia: null, anos: [] }),
        porPeriodo: jest.fn().mockResolvedValue({ rotulo: "x", cortadoNoDia: null, anos: [] }) } as never,
      // Comparação com o período anterior (29/09) — dublada.
      { porRecorte: jest.fn().mockResolvedValue({ rotulo: "x", atual: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anterior: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anteriorFechado: null }),
        porDatas: jest.fn().mockResolvedValue({ rotulo: "x", atual: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anterior: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anteriorFechado: null }) } as never,
      // ConexoesService e WahaAdminClient (29/09) — dublados. O `catch`
      // do handler faz a lista sair mesmo sem WAHA, e e isso que o
      // `mockRejectedValue` exercita nos testes que nao ligam para conexao.
      { vendedoraDaSessao: (s: string) => s.replace(/^vend-/, "") } as never,
      { listarSessoes: jest.fn().mockResolvedValue([]) } as never,
      { itens: jest.fn() } as never,
      listarProdutos as never,
      { execute: jest.fn() } as never,
      { vendas: jest.fn(), metas: jest.fn() } as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), detalhe: jest.fn(), resumo: jest.fn() } as never,
      { doDia: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), buscarPorId: jest.fn() } as never,
      { buscarPorNomeParcial: jest.fn() } as never,
      { listarAguardandoGestao: jest.fn() } as never,
      // O ponteiro de conversas vivas (29/09) — dublado: estes testes
      // descrevem o roteamento das ferramentas, nao a consulta.
      { entre: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  const linha = async (verQuantidade?: boolean) => {
    comEstoque(4);
    const r = await servico
      .montar(verQuantidade === undefined ? {} : { verQuantidade })
      .gestaoProdutos({ busca: 'anel' });
    return r.produtos[0].linha;
  };

  describe('sem `estoque:quantidade` — a gerente', () => {
    it('diz "disponível", e nao ha numero de saldo na frase', async () => {
      const texto = await linha(false);

      expect(texto).toContain('disponível');
      // O PADRAO, e nao o digito: o preco (R$ 17.490) e o codigo (AN25258)
      // tambem tem numeros, entao `not.toContain('4')` falharia por eles e nao
      // pelo saldo. O que nao pode existir e "<numero> em estoque".
      expect(texto).not.toMatch(/\d+\s*(un|peç|em estoque)/i);
    });

    it('o preco de venda continua saindo — e o que ela precisa para atender', async () => {
      expect(await linha(false)).toContain('17.490');
    });

    it('a frase NAO anuncia que existe um numero escondido', async () => {
      const texto = await linha(false);

      // "disponível (quantidade restrita)" seria pior que o silêncio: convida
      // a insistir, e a insistência não leva a lugar nenhum.
      expect(texto.toLowerCase()).not.toContain('restrit');
      expect(texto.toLowerCase()).not.toContain('permiss');
    });

    it('sem saldo continua dizendo "sem estoque" — a resposta util e a mesma', async () => {
      comEstoque(0);
      const r = await servico
        .montar({ verQuantidade: false })
        .gestaoProdutos({ busca: 'anel' });

      expect(r.produtos[0].linha).toContain('sem estoque');
    });

    it('o padrao do montar ja e o restrito', async () => {
      // Mesma regra do `verLoja`: esquecer de informar tira uma informacao,
      // nao abre uma.
      expect(await linha()).toContain('disponível');
    });
  });

  describe('com `estoque:quantidade` — a Equipe AT', () => {
    it('o numero volta', async () => {
      expect(await linha(true)).toContain('4 em estoque');
    });
  });
});

/**
 * O RECORTE DE EQUIPE NAS FERRAMENTAS DA ANASTASIA — RF-06 e RF-08.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE: AS DUAS PORTAS CONCORDAM.
 *
 * A tela de Vendas ja recortava por equipe pelo `EscopoVendasService`. Se o
 * WhatsApp nao recortasse, a MESMA pergunta teria resposta diferente conforme
 * a porta — o sintoma que o codigo deste projeto avisa em varios lugares para
 * nao deixar acontecer, porque ninguem descobre olhando uma tela so.
 *
 * `null` = sem equipe = alcanca todas. E o estado de todo mundo hoje, e por
 * isso este recorte entrou sem mudar comportamento de ninguem.
 * ==========================================================================
 */
describe('o recorte de equipe nas ferramentas de gestao', () => {
  const MARINA_ID = 'vd-1';
  const DE_FORA_ID = 'vd-9';

  let resolverVendedora: { execute: jest.Mock };
  let vendedoras: { listar: jest.Mock; buscarPorId: jest.Mock };
  let desempenho: { vendas: jest.Mock; metas: jest.Mock };
  let consultarVendas: { ranking: jest.Mock; itens: jest.Mock };
  let servico: FerramentasGestaoService;

  beforeEach(() => {
    resolverVendedora = { execute: jest.fn() };
    vendedoras = {
      listar: jest.fn().mockResolvedValue([
        { id: MARINA_ID, nome: 'Marina', statusDisponibilidade: 'DISPONIVEL', especialidades: [] },
        { id: DE_FORA_ID, nome: 'Beatriz', statusDisponibilidade: 'DISPONIVEL', especialidades: [] },
      ]),
      buscarPorId: jest.fn(),
    };
    desempenho = {
      vendas: jest
        .fn()
        .mockResolvedValue({ quantidade: 2, receita: 1000, ticketMedio: 500 }),
      metas: jest.fn(),
    };
    // O ranking devolve QUEM VENDEU — inclusive quem ja saiu. A Marina e da
    // equipe; a Beatriz e de fora e serve para provar o recorte.
    consultarVendas = {
      ranking: jest.fn().mockResolvedValue({
        linhas: [
          { vendedoraId: MARINA_ID, nome: 'Marina', codigoErp: 'VD01', quantidade: 3, valor: 9000 },
          { vendedoraId: DE_FORA_ID, nome: 'Beatriz', codigoErp: 'VD09', quantidade: 5, valor: 20000 },
        ],
      }),
      itens: jest.fn().mockResolvedValue({ linhas: [] }),
    };

    servico = new FerramentasGestaoService(
      resolverVendedora as never,
      consultarVendas as never,
      // As metricas de atendimento (ANA-08 a 12, 29/09) — dubladas: estes
      // testes descrevem o roteamento das ferramentas, nao o SQL.
      { execute: jest.fn().mockResolvedValue({
        de: new Date(), ate: new Date(),
        leadsPorVendedora: [], interacoesPorVendedora: [],
        primeiraResposta: { minutos: null, amostra: 0, minimo: null, maximo: null },
        duracaoDoAtendimento: { minutos: null, amostra: 0, minimo: null, maximo: null },
        ateFecharVenda: { minutos: null, amostra: 0, minimo: null, maximo: null },
      }) } as never,
      // Rankings (ANA-14, 29/09) — dublados.
      { execute: jest.fn().mockResolvedValue({
        de: new Date(), ate: new Date(),
        respondeMaisRapido: [], fechaMaisRapido: [], maisInterage: [],
        maisConverte: [], maisLeads: [], semAmostra: [],
      }) } as never,
      // Análise de tom (ANA-15, 29/09) — dublada.
      { execute: jest.fn().mockResolvedValue({ status: 'SEM_CONVERSA' }) } as never,
      // Comparação ano a ano (29/09) — dublada.
      { porMes: jest.fn().mockResolvedValue({ rotulo: "x", cortadoNoDia: null, anos: [] }),
        porPeriodo: jest.fn().mockResolvedValue({ rotulo: "x", cortadoNoDia: null, anos: [] }) } as never,
      // Comparação com o período anterior (29/09) — dublada.
      { porRecorte: jest.fn().mockResolvedValue({ rotulo: "x", atual: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anterior: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anteriorFechado: null }),
        porDatas: jest.fn().mockResolvedValue({ rotulo: "x", atual: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anterior: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anteriorFechado: null }) } as never,
      // ConexoesService e WahaAdminClient (29/09) — dublados. O `catch`
      // do handler faz a lista sair mesmo sem WAHA, e e isso que o
      // `mockRejectedValue` exercita nos testes que nao ligam para conexao.
      { vendedoraDaSessao: (s: string) => s.replace(/^vend-/, "") } as never,
      { listarSessoes: jest.fn().mockResolvedValue([]) } as never,
      { execute: jest.fn().mockResolvedValue([]) } as never,
      { execute: jest.fn().mockResolvedValue([]) } as never,
      desempenho as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), detalhe: jest.fn(), resumo: jest.fn() } as never,
      { doDia: jest.fn() } as never,
      { execute: jest.fn() } as never,
      vendedoras as never,
      { buscarPorNomeParcial: jest.fn() } as never,
      { listarAguardandoGestao: jest.fn() } as never,
      // O ponteiro de conversas vivas (29/09) — dublado: estes testes
      // descrevem o roteamento das ferramentas, nao a consulta.
      { entre: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  const soMarina = { equipe: [MARINA_ID] };

  describe('vendas_de_vendedora', () => {
    it('responde pela vendedora DA equipe', async () => {
      resolverVendedora.execute.mockResolvedValue({
        status: 'OK', id: MARINA_ID, nome: 'Marina', codigoErp: 'VD01',
      });

      const r = await servico.montar(soMarina).gestaoVendas({
        vendedora: 'Marina', periodo: 'MES',
      });

      expect(r.status).toBe('OK');
    });

    it('vendedora de FORA responde "nao encontrada" — e nao "sem permissao"', async () => {
      resolverVendedora.execute.mockResolvedValue({
        status: 'OK', id: DE_FORA_ID, nome: 'Beatriz', codigoErp: 'VD09',
      });

      const r = await servico.montar(soMarina).gestaoVendas({
        vendedora: 'Beatriz', periodo: 'MES',
      });

      // A gerente de um time nao precisa saber quem esta no outro: dizer
      // "voce nao pode ver a Beatriz" confirmaria que a Beatriz existe.
      expect(r.status).toBe('NAO_ENCONTRADA');
      expect(desempenho.vendas).not.toHaveBeenCalled();
    });

    it('e as SUGESTOES tambem vem vazias', async () => {
      // Devolver "voce quis dizer Beatriz?" entregaria pela lista o que a
      // recusa acabou de esconder.
      resolverVendedora.execute.mockResolvedValue({
        status: 'OK', id: DE_FORA_ID, nome: 'Beatriz', codigoErp: 'VD09',
      });

      const r = await servico.montar(soMarina).gestaoVendas({
        vendedora: 'Beatriz', periodo: 'MES',
      });

      expect(r.nomes).toEqual([]);
    });

    it('sem equipe, alcanca todas — o comportamento historico', async () => {
      resolverVendedora.execute.mockResolvedValue({
        status: 'OK', id: DE_FORA_ID, nome: 'Beatriz', codigoErp: 'VD09',
      });

      const r = await servico.montar({}).gestaoVendas({
        vendedora: 'Beatriz', periodo: 'MES',
      });

      expect(r.status).toBe('OK');
    });
  });

  describe('panorama_da_equipe', () => {
    it('lista so as da equipe', async () => {
      const r = await servico.montar(soMarina).gestaoPanorama({ periodo: 'MES' });

      expect(r.linhas).toHaveLength(1);
      expect(r.linhas[0]).toContain('Marina');
      expect(r.linhas[0]).not.toContain('Beatriz');
    });

    it('sem equipe, lista as duas', async () => {
      const r = await servico.montar({}).gestaoPanorama({ periodo: 'MES' });

      expect(r.linhas).toHaveLength(2);
    });
  });

  describe('listar_vendedoras', () => {
    it('oferece so quem a gerente alcanca', async () => {
      // Oferecer um nome de outro time faria ela encaminhar para fora do
      // alcance, e o erro so apareceria depois.
      const r = await servico.montar(soMarina).gestaoVendedoras();

      // A primeira linha e o resumo de conexao (29/09); o recorte de equipe
      // e o que vem depois, e e o que este teste guarda.
      expect(r.linhas.slice(1)).toEqual(['Marina — celular NÃO conectado']);
    });
  });

  describe('equipe VAZIA', () => {
    it('nao alcanca ninguem — e nao vira "todas"', async () => {
      const r = await servico.montar({ equipe: [] }).gestaoPanorama({ periodo: 'MES' });

      expect(r.linhas).toEqual([]);
    });
  });
});

/**
 * O PERIODO LIVRE — 28/09/2026.
 *
 * ==========================================================================
 * NASCEU DE UMA RECUSA QUE NAO DEVIA EXISTIR.
 *
 * O Lucas perguntou "o que a Camila mais vendeu nos ultimos 6 meses" e recebeu
 * "nao da para escolher exatamente seis meses". Era limitacao nossa: os
 * metodos `resumoEntre`, `itensEntre` e `rankingEntre` existiam desde 25/09 e
 * ninguem os chamava.
 *
 * O QUE ESTES TESTES PROTEGEM E A RECUSA SILENCIOSA. Quem preenche as datas e
 * o MODELO, e ele erra as vezes. Uma data impossivel aceita viraria um periodo
 * errado e MUDO; caindo no atalho, o periodo tambem e outro, mas a agente diz
 * qual recorte usou. Entre os dois, o que se percebe.
 * ==========================================================================
 */
describe('o periodo livre nas ferramentas de venda', () => {
  let consultarVendas: {
    ranking: jest.Mock;
    rankingEntre: jest.Mock;
    itens: jest.Mock;
    itensEntre: jest.Mock;
    resumoEntre: jest.Mock;
  };
  let servico: FerramentasGestaoService;

  beforeEach(() => {
    consultarVendas = {
      ranking: jest.fn().mockResolvedValue({ linhas: [] }),
      rankingEntre: jest.fn().mockResolvedValue([]),
      itens: jest.fn().mockResolvedValue({ linhas: [] }),
      itensEntre: jest.fn().mockResolvedValue([]),
      resumoEntre: jest
        .fn()
        .mockResolvedValue({ quantidade: 4, receita: 8000, ticketMedio: 2000 }),
    };

    servico = new FerramentasGestaoService(
      {
        execute: jest.fn().mockResolvedValue({
          status: 'OK',
          id: 'vd-1',
          nome: 'Camila',
          codigoErp: 'VD01',
        }),
      } as never,
      consultarVendas as never,
      // As metricas de atendimento (ANA-08 a 12, 29/09) — dubladas: estes
      // testes descrevem o roteamento das ferramentas, nao o SQL.
      { execute: jest.fn().mockResolvedValue({
        de: new Date(), ate: new Date(),
        leadsPorVendedora: [], interacoesPorVendedora: [],
        primeiraResposta: { minutos: null, amostra: 0, minimo: null, maximo: null },
        duracaoDoAtendimento: { minutos: null, amostra: 0, minimo: null, maximo: null },
        ateFecharVenda: { minutos: null, amostra: 0, minimo: null, maximo: null },
      }) } as never,
      // Rankings (ANA-14, 29/09) — dublados.
      { execute: jest.fn().mockResolvedValue({
        de: new Date(), ate: new Date(),
        respondeMaisRapido: [], fechaMaisRapido: [], maisInterage: [],
        maisConverte: [], maisLeads: [], semAmostra: [],
      }) } as never,
      // Análise de tom (ANA-15, 29/09) — dublada.
      { execute: jest.fn().mockResolvedValue({ status: 'SEM_CONVERSA' }) } as never,
      // Comparação ano a ano (29/09) — dublada.
      { porMes: jest.fn().mockResolvedValue({ rotulo: "x", cortadoNoDia: null, anos: [] }),
        porPeriodo: jest.fn().mockResolvedValue({ rotulo: "x", cortadoNoDia: null, anos: [] }) } as never,
      // Comparação com o período anterior (29/09) — dublada.
      { porRecorte: jest.fn().mockResolvedValue({ rotulo: "x", atual: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anterior: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anteriorFechado: null }),
        porDatas: jest.fn().mockResolvedValue({ rotulo: "x", atual: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anterior: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anteriorFechado: null }) } as never,
      // ConexoesService e WahaAdminClient (29/09) — dublados. O `catch`
      // do handler faz a lista sair mesmo sem WAHA, e e isso que o
      // `mockRejectedValue` exercita nos testes que nao ligam para conexao.
      { vendedoraDaSessao: (s: string) => s.replace(/^vend-/, "") } as never,
      { listarSessoes: jest.fn().mockResolvedValue([]) } as never,
      { execute: jest.fn().mockResolvedValue([]) } as never,
      { execute: jest.fn().mockResolvedValue([]) } as never,
      { vendas: jest.fn(), metas: jest.fn() } as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), detalhe: jest.fn(), resumo: jest.fn() } as never,
      { doDia: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn().mockResolvedValue([]), buscarPorId: jest.fn() } as never,
      { buscarPorNomeParcial: jest.fn() } as never,
      { listarAguardandoGestao: jest.fn() } as never,
      // O ponteiro de conversas vivas (29/09) — dublado: estes testes
      // descrevem o roteamento das ferramentas, nao a consulta.
      { entre: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  const itens = (extra: Record<string, unknown>) =>
    servico.montar({ verLoja: true }).gestaoItens(extra as never);

  describe('quando as datas chegam certas', () => {
    it('usa a janela livre e NAO o atalho', async () => {
      await itens({ de: '2026-04-01', ate: '2026-09-28', limite: 10 });

      expect(consultarVendas.itensEntre).toHaveBeenCalled();
      expect(consultarVendas.itens).not.toHaveBeenCalled();
    });

    it('o fim entra como data, e o dia inteiro conta no use case', async () => {
      await itens({ de: '2026-08-01', ate: '2026-08-31' });

      const [de, ate] = consultarVendas.itensEntre.mock.calls[0];
      expect(de.getFullYear()).toBe(2026);
      expect(de.getMonth() + 1).toBe(8);
      expect(de.getDate()).toBe(1);
      expect(ate.getDate()).toBe(31);
    });

    it('o atalho e ignorado quando as datas vem juntas', async () => {
      await itens({ periodo: 'HOJE', de: '2026-01-01', ate: '2026-03-31' });

      expect(consultarVendas.itensEntre).toHaveBeenCalled();
      expect(consultarVendas.itens).not.toHaveBeenCalled();
    });
  });

  describe('quando a data nao presta, cai no atalho — e nao responde errado calado', () => {
    it.each([
      ['so o inicio', { de: '2026-04-01' }],
      ['so o fim', { ate: '2026-09-28' }],
      ['formato errado', { de: '01/04/2026', ate: '28/09/2026' }],
      ['dia que nao existe', { de: '2026-02-30', ate: '2026-03-31' }],
      ['mes que nao existe', { de: '2026-13-01', ate: '2026-13-31' }],
      ['inicio depois do fim', { de: '2026-09-28', ate: '2026-04-01' }],
      ['texto solto', { de: 'ultimos 6 meses', ate: 'hoje' }],
    ])('%s', async (_nome, entrada) => {
      await itens({ ...entrada, periodo: 'MES' });

      expect(consultarVendas.itensEntre).not.toHaveBeenCalled();
      expect(consultarVendas.itens).toHaveBeenCalled();
    });
  });

  it('o panorama tambem aceita a janela livre', async () => {
    await servico
      .montar({})
      .gestaoPanorama({ de: '2026-04-01', ate: '2026-09-28' });

    expect(consultarVendas.rankingEntre).toHaveBeenCalled();
    expect(consultarVendas.ranking).not.toHaveBeenCalled();
  });

  it('as vendas de UMA vendedora tambem', async () => {
    const r = await servico
      .montar({})
      .gestaoVendas({ vendedora: 'Camila', de: '2026-04-01', ate: '2026-09-28' });

    expect(consultarVendas.resumoEntre).toHaveBeenCalled();
    expect(r.linhas[0]).toContain('4 vendas');
  });
});

/**
 * "QUEM MAIS VENDE BRINCO EM OUTUBRO?" — 28/09/2026.
 *
 * ==========================================================================
 * A PERGUNTA QUE NENHUMA FERRAMENTA RESPONDIA, E A ARMADILHA DELA.
 *
 * "Em outubro" sem ano nao e uma janela: e um corte que ATRAVESSA os anos. Um
 * `de`/`ate` responderia UM outubro; a pergunta quer os outubros, quebrados
 * por ano — "em 2025 foi essa, em 2024 foi essa".
 *
 * O `mes` manda em tudo quando vem, e estes testes existem para que ninguem
 * "simplifique" isso transformando `mes` numa janela do ano corrente.
 * ==========================================================================
 */
describe('o ranking por tipo de peça', () => {
  let consultarVendas: {
    porFamilia: jest.Mock;
    porFamiliaEntre: jest.Mock;
    porFamiliaNoMes: jest.Mock;
  };
  let listarProdutos: { execute: jest.Mock; familias: jest.Mock };
  let servico: FerramentasGestaoService;

  beforeEach(() => {
    consultarVendas = {
      porFamilia: jest.fn().mockResolvedValue({ linhas: [] }),
      porFamiliaEntre: jest.fn().mockResolvedValue([]),
      porFamiliaNoMes: jest.fn().mockResolvedValue([
        { ano: 2025, vendedoraId: 'vd-1', nome: 'Keyciane', quantidade: 4, valor: 60605 },
        { ano: 2024, vendedoraId: 'vd-2', nome: 'Faby', quantidade: 6, valor: 364623 },
      ]),
    };
    listarProdutos = {
      execute: jest.fn().mockResolvedValue([]),
      familias: jest.fn().mockResolvedValue(['BRINCO', 'ANEL', 'PULSEIRA']),
    };

    servico = new FerramentasGestaoService(
      { execute: jest.fn() } as never,
      consultarVendas as never,
      // As metricas de atendimento (ANA-08 a 12, 29/09) — dubladas: estes
      // testes descrevem o roteamento das ferramentas, nao o SQL.
      { execute: jest.fn().mockResolvedValue({
        de: new Date(), ate: new Date(),
        leadsPorVendedora: [], interacoesPorVendedora: [],
        primeiraResposta: { minutos: null, amostra: 0, minimo: null, maximo: null },
        duracaoDoAtendimento: { minutos: null, amostra: 0, minimo: null, maximo: null },
        ateFecharVenda: { minutos: null, amostra: 0, minimo: null, maximo: null },
      }) } as never,
      // Rankings (ANA-14, 29/09) — dublados.
      { execute: jest.fn().mockResolvedValue({
        de: new Date(), ate: new Date(),
        respondeMaisRapido: [], fechaMaisRapido: [], maisInterage: [],
        maisConverte: [], maisLeads: [], semAmostra: [],
      }) } as never,
      // Análise de tom (ANA-15, 29/09) — dublada.
      { execute: jest.fn().mockResolvedValue({ status: 'SEM_CONVERSA' }) } as never,
      // Comparação ano a ano (29/09) — dublada.
      { porMes: jest.fn().mockResolvedValue({ rotulo: "x", cortadoNoDia: null, anos: [] }),
        porPeriodo: jest.fn().mockResolvedValue({ rotulo: "x", cortadoNoDia: null, anos: [] }) } as never,
      // Comparação com o período anterior (29/09) — dublada.
      { porRecorte: jest.fn().mockResolvedValue({ rotulo: "x", atual: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anterior: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anteriorFechado: null }),
        porDatas: jest.fn().mockResolvedValue({ rotulo: "x", atual: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anterior: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anteriorFechado: null }) } as never,
      // ConexoesService e WahaAdminClient (29/09) — dublados. O `catch`
      // do handler faz a lista sair mesmo sem WAHA, e e isso que o
      // `mockRejectedValue` exercita nos testes que nao ligam para conexao.
      { vendedoraDaSessao: (s: string) => s.replace(/^vend-/, "") } as never,
      { listarSessoes: jest.fn().mockResolvedValue([]) } as never,
      listarProdutos as never,
      { execute: jest.fn() } as never,
      { vendas: jest.fn(), metas: jest.fn() } as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), detalhe: jest.fn(), resumo: jest.fn() } as never,
      { doDia: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn().mockResolvedValue([]), buscarPorId: jest.fn() } as never,
      { buscarPorNomeParcial: jest.fn() } as never,
      { listarAguardandoGestao: jest.fn() } as never,
      // O ponteiro de conversas vivas (29/09) — dublado: estes testes
      // descrevem o roteamento das ferramentas, nao a consulta.
      { entre: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  const pedir = (entrada: Record<string, unknown>) =>
    servico.montar({}).gestaoPorFamilia(entrada as never);

  describe('o mês recorrente', () => {
    it('quebra por ano, com o mês por extenso', async () => {
      const r = await pedir({ familia: 'brinco', mes: 10 });

      // O `moeda()` e nao a string escrita a mao: o `Intl` separa o "R$" do
      // numero com ESPACO NAO-SEPARAVEL (U+00A0), e um espaco comum aqui
      // reprova um codigo certo com as duas linhas parecendo IDENTICAS na tela.
      expect(r.linhas).toEqual([
        `outubro/2025 — Keyciane: 4 brincos, ${moeda(60605)}`,
        `outubro/2024 — Faby: 6 brincos, ${moeda(364623)}`,
      ]);
    });

    it('o mês GANHA das datas e do período — não é uma janela', async () => {
      await pedir({ familia: 'brinco', mes: 10, periodo: 'ANO', de: '2026-01-01', ate: '2026-12-31' });

      expect(consultarVendas.porFamiliaNoMes).toHaveBeenCalled();
      expect(consultarVendas.porFamiliaEntre).not.toHaveBeenCalled();
      expect(consultarVendas.porFamilia).not.toHaveBeenCalled();
    });

    it('o padrão é 1 por ano — a campeã de cada', async () => {
      await pedir({ familia: 'brinco', mes: 10 });

      expect(consultarVendas.porFamiliaNoMes).toHaveBeenCalledWith('BRINCO', 10, 1);
    });

    it.each([0, 13, -1, 99])('mês inválido (%s) cai na janela normal', async (mes) => {
      await pedir({ familia: 'brinco', mes });

      expect(consultarVendas.porFamiliaNoMes).not.toHaveBeenCalled();
      expect(consultarVendas.porFamilia).toHaveBeenCalled();
    });
  });

  describe('a família', () => {
    it('casa sem caixa e usa o nome do catálogo na consulta', async () => {
      await pedir({ familia: '  BrInCo ', mes: 10 });

      expect(consultarVendas.porFamiliaNoMes).toHaveBeenCalledWith('BRINCO', 10, 1);
    });

    it('nome que não existe devolve a LISTA, e não uma resposta vazia', async () => {
      // Zero linhas seria indistinguivel de "ninguem vendeu bracelete".
      const r = await pedir({ familia: 'bracelete', mes: 10 });

      expect(r.status).toBe('FAMILIA_DESCONHECIDA');
      expect(r.familias).toEqual(['BRINCO', 'ANEL', 'PULSEIRA']);
      expect(consultarVendas.porFamiliaNoMes).not.toHaveBeenCalled();
    });
  });

  describe('o plural, que saiu errado no primeiro teste real', () => {
    it.each([
      ['ANEL', 7, '7 anéis'],
      ['ANEL', 1, '1 anel'],
      ['BRINCO', 4, '4 brincos'],
      ['PULSEIRA', 3, '3 pulseiras'],
    ])('%s x%s vira "%s"', async (familia, quantidade, esperado) => {
      listarProdutos.familias.mockResolvedValue([familia]);
      consultarVendas.porFamiliaNoMes.mockResolvedValue([
        { ano: 2025, vendedoraId: 'vd-1', nome: 'X', quantidade, valor: 100 },
      ]);

      const r = await pedir({ familia, mes: 10 });

      expect(r.linhas[0]).toContain(esperado);
    });
  });

  it('o recorte de equipe vale aqui também', async () => {
    const r = await servico
      .montar({ equipe: ['vd-1'] })
      .gestaoPorFamilia({ familia: 'brinco', mes: 10 } as never);

    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toContain('Keyciane');
  });
});
