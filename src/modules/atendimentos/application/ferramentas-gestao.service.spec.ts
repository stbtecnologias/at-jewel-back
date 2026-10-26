import { FerramentasGestaoService } from './ferramentas-gestao.service';

/**
 * A Conexa nestes testes nunca tem a foto — e o caso comum: das 320 joias
 * com saldo, 55 tem foto. Quem testa roteamento nao testa imagem.
 */
const SEM_FOTOS = {
  buscar: async () => ({ fotos: [], tinhamUrl: 0, cortadas: 0 }),
} as never;

/**
 * As ferramentas da gestao.
 *
 * O QUE ESTE ARQUIVO PROTEGE, acima de tudo: o TETO NAO PODE SER SILENCIOSO.
 * Uma carteira de trezentos clientes devolve dez, e se a resposta nao disser
 * "dez dos trezentos", quem le vai embora achando que sao dez. Nao e um erro
 * que aparece no log — aparece numa decisao errada semanas depois.
 */
describe('FerramentasGestaoService', () => {
  let resolverVendedora: { execute: jest.Mock };
  let agenda: { execute: jest.Mock };
  let desempenho: { vendas: jest.Mock; metas: jest.Mock };
  let carteira: {
    semComprar: jest.Mock;
    maioresCompradores: jest.Mock;
    porEpoca: jest.Mock;
    porEpocaDaLoja: jest.Mock;
  };
  let agendarGestao: { execute: jest.Mock };
  let auditoria: { listar: jest.Mock; detalhe: jest.Mock };
  let linha: { doDia: jest.Mock };
  let waha: { listarSessoes: jest.Mock };
  let vendedoras: {
    listar: jest.Mock;
    buscarPorCodigoErp: jest.Mock;
    buscarPorId: jest.Mock;
  };
  let clientes: {
    buscarPorNomeParcial: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorCodigoErp: jest.Mock;
  };
  let vendasDetalhadas: jest.Mock;
  let porEmpresa: jest.Mock;
  let leads: { listarAguardandoGestao: jest.Mock };
  let conversas: { entre: jest.Mock };
  /** Os tres passos do catalogo pela conversa — 22/10/2026. */
  let criarCat: { execute: jest.Mock };
  /** RF32: a ultima lista, o cadastro da peca e o catalogo que recebe. */
  let ultimoRel: { guardar: jest.Mock; guardarTexto: jest.Mock; pegar: jest.Mock };
  let produtosRepo: { findByCodigoErp: jest.Mock };
  let catalogosRepo: {
    criarFoto: jest.Mock;
    listarAbertos: jest.Mock;
    buscarPorId: jest.Mock;
    atualizarFoto: jest.Mock;
  };
  let pdfDeFotos: { execute: jest.Mock };
  let fotosDaPeca: { listar: jest.Mock };
  let anexarRef: { texto: jest.Mock };
  let atualizarCat: { execute: jest.Mock };
  let servico: FerramentasGestaoService;

  const MARINA = {
    status: 'ACHOU',
    id: 'vd-1',
    nome: 'Marina Albuquerque',
    codigoErp: 'SEED-VD01',
  };

  beforeEach(() => {
    resolverVendedora = { execute: jest.fn().mockResolvedValue(MARINA) };
    agenda = { execute: jest.fn().mockResolvedValue([]) };
    desempenho = {
      vendas: jest
        .fn()
        .mockResolvedValue({ quantidade: 0, receita: 0, ticketMedio: 0 }),
      metas: jest.fn().mockResolvedValue([]),
    };
    carteira = {
      semComprar: jest.fn().mockResolvedValue({ clientes: [], total: 0 }),
      maioresCompradores: jest
        .fn()
        .mockResolvedValue({ clientes: [], total: 0 }),
      porEpoca: jest.fn().mockResolvedValue({ clientes: [], total: 0 }),
      porEpocaDaLoja: jest.fn().mockResolvedValue({ clientes: [], total: 0 }),
    };
    agendarGestao = { execute: jest.fn() };
    auditoria = {
      listar: jest.fn().mockResolvedValue({ itens: [], total: 0 }),
      detalhe: jest.fn(),
    };
    linha = { doDia: jest.fn().mockResolvedValue([]) };
    waha = { listarSessoes: jest.fn().mockResolvedValue([]) };
    vendedoras = {
      listar: jest.fn().mockResolvedValue([]),
      buscarPorCodigoErp: jest.fn().mockResolvedValue(null),
      buscarPorId: jest.fn().mockResolvedValue(null),
    };
    clientes = {
      buscarPorNomeParcial: jest.fn().mockResolvedValue([]),
      buscarPorId: jest.fn().mockResolvedValue(null),
      buscarPorCodigoErp: jest.fn().mockResolvedValue(null),
    };
    vendasDetalhadas = jest.fn().mockResolvedValue({ vendas: [], total: 0 });
    porEmpresa = jest.fn().mockResolvedValue([
      { empresa: 'AT JEWEL LTDA', vendas: 1087, receita: 61711799.82, devolucoes: 92 },
      { empresa: 'MP COMERCIO DE METAIS LTDA', vendas: 200, receita: 542905.55, devolucoes: 9 },
    ]);
    leads = { listarAguardandoGestao: jest.fn().mockResolvedValue([]) };
    conversas = { entre: jest.fn().mockResolvedValue([]) };
    criarCat = {
      execute: jest
        .fn()
        .mockResolvedValue({ id: 'cat-1', numero: '0042', nome: 'Dia das Mães' }),
    };
    anexarRef = { texto: jest.fn().mockResolvedValue({ id: 'ref-1' }) };
    atualizarCat = { execute: jest.fn().mockResolvedValue({ id: 'cat-1' }) };
    ultimoRel = { guardar: jest.fn(), guardarTexto: jest.fn(), pegar: jest.fn() };
    produtosRepo = { findByCodigoErp: jest.fn() };
    catalogosRepo = {
      criarFoto: jest.fn().mockResolvedValue({ id: 'f-1' }),
      listarAbertos: jest.fn().mockResolvedValue([
        { id: 'cat-1', numero: '0042', nome: 'Under 25k' },
      ]),
      // RF47 — o ajuste pela conversa le as fotos do catalogo para achar a
      // peca pelo CODIGO, que e como ela a chama.
      buscarPorId: jest.fn().mockResolvedValue({
        id: 'cat-1',
        numero: '0042',
        nome: 'Under 25k',
        fotos: [
          { id: 'f-1', codigoErp: 'AN2568', status: 'APROVADA' },
          { id: 'f-2', codigoErp: 'AN2568', status: 'APROVADA' },
          { id: 'f-3', codigoErp: 'GD5478', status: 'APROVADA' },
          { id: 'f-4', codigoErp: 'BR1111', status: 'REPROVADA' },
        ],
      }),
      atualizarFoto: jest.fn().mockResolvedValue(undefined),
    };
    pdfDeFotos = {
      execute: jest.fn().mockResolvedValue({
        conteudo: Buffer.from('%PDF-1.3'),
        nome: 'catalogo-0042-under-25k.pdf',
        paginas: 3,
        cortadas: 0,
      }),
    };
    fotosDaPeca = { listar: jest.fn().mockResolvedValue([]) };

    servico = new FerramentasGestaoService(
      resolverVendedora as never,
      // A consulta de venda, que desde 25/09 le a MOVIMENTACAO. Dublada aqui:
      // estes testes descrevem o roteamento das ferramentas, nao o SQL.
      {
        itens: jest.fn().mockResolvedValue({ linhas: [] }),
        detalhadas: vendasDetalhadas,
        porEmpresa,
      } as never,
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
      waha as never,
      // A consulta de catalogo da GESTAO, com quantidade — dublada.
      { execute: jest.fn().mockResolvedValue([]) } as never,
      SEM_FOTOS,
      agenda as never,
      desempenho as never,
      carteira as never,
      agendarGestao as never,
      auditoria as never,
      // ConsultarLinhaDoTempoUseCase — o resumo do dia da vendedora.
      linha as never,
      { execute: jest.fn() } as never,
      vendedoras as never,
      clientes as never,
      leads as never,
      // O ponteiro de conversas vivas (29/09) — o `conversas_agora`.
      conversas as never,
      // RF33 — as fotos da PECA.
      fotosDaPeca as never,
      // RF36/RF37: guarda a tabela para virar arquivo.
      ultimoRel as never,
      // 22/10: criar catalogo pela conversa.
      criarCat as never,
      anexarRef as never,
      atualizarCat as never,
      // RF32: as pecas da lista entrando no catalogo.
      produtosRepo as never,
      catalogosRepo as never,
      // RF38: o dossie da estrategia de vendas.
      { montar: jest.fn().mockResolvedValue('dossie') } as never,
      // RF47: o catalogo em PDF.
      pdfDeFotos as never,
      // O repositorio de empresas — 26/10/2026, as vendas por filial.
      { listar: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  /**
   * O AGORA — `conversas_agora`, 29/09/2026.
   *
   * ======================================================================
   * O QUE ESTES TESTES PROTEGEM E O QUE A FERRAMENTA **NAO** PODE AFIRMAR.
   *
   * Ela le o ponteiro, que sabe QUE ha conversa e ha quanto tempo. Nao sabe o
   * assunto, e nao sabe se o numero desconhecido e cliente — o leitor e quem
   * decide isso, uma hora depois. Chamar de cliente quem ainda nao foi
   * identificado transformaria "tem alguem no WhatsApp dela" em "ela esta
   * atendendo 3 clientes", que e numero inventado com cara de relatorio.
   * ======================================================================
   */
  describe('quem esta conversando agora', () => {
    const minutosAtras = (n: number) => new Date(Date.now() - n * 60_000);

    it('a janela padrao e de 30 minutos', async () => {
      const antes = Date.now();
      await servico.montar().gestaoConversasAgora({});

      const [desde, , id] = conversas.entre.mock.calls[0];
      expect(id).toBeNull();
      const janela = (antes - (desde as Date).getTime()) / 60_000;
      expect(janela).toBeGreaterThanOrEqual(29.9);
      expect(janela).toBeLessThan(31);
    });

    it('quem pede outra janela recebe a que pediu', async () => {
      const antes = Date.now();
      await servico.montar().gestaoConversasAgora({ minutos: 120 });

      const [desde] = conversas.entre.mock.calls[0];
      const janela = (antes - (desde as Date).getTime()) / 60_000;
      expect(janela).toBeGreaterThanOrEqual(119.9);
      expect(janela).toBeLessThan(121);
    });

    it('janela absurda cai no padrao em vez de virar consulta', async () => {
      const antes = Date.now();
      await servico.montar().gestaoConversasAgora({ minutos: 99999 });

      const [desde] = conversas.entre.mock.calls[0];
      expect((antes - (desde as Date).getTime()) / 60_000).toBeLessThan(31);
    });

    /*
     * O TESTE CENTRAL. Sem ele, a forma mais natural de escrever o handler —
     * contar as linhas e chamar de clientes — passaria despercebida.
     */
    it('numero ainda nao identificado NAO e chamado de cliente', async () => {
      conversas.entre.mockResolvedValue([
        { vendedoraId: 'vd-1', clienteId: null, ultimaMensagemEm: minutosAtras(9) },
      ]);
      vendedoras.listar.mockResolvedValue([
        { id: 'vd-1', nome: 'Marina Albuquerque' },
      ]);

      const r = await servico.montar().gestaoConversasAgora({});

      const texto = r.linhas.join('\n');
      expect(texto).toContain('NÃO identificado');
      expect(texto).not.toMatch(/\bclientes?\b/i);
      expect(clientes.buscarPorId).not.toHaveBeenCalled();
    });

    it('cliente conhecida aparece pelo nome, com ha quanto tempo', async () => {
      conversas.entre.mockResolvedValue([
        { vendedoraId: 'vd-1', clienteId: 'cl-1', ultimaMensagemEm: minutosAtras(9) },
      ]);
      vendedoras.listar.mockResolvedValue([{ id: 'vd-1', nome: 'Marina' }]);
      clientes.buscarPorId.mockResolvedValue({ nome: 'Patrícia Lima' });

      const r = await servico.montar().gestaoConversasAgora({});

      expect(r.linhas[0]).toContain('1 conversa');
      expect(r.linhas[1]).toBe('Marina: Patrícia Lima — última mensagem há 9 min');
    });

    /*
     * Com uma vendedora so, o nome dela ja volta no `vendedora` do resultado.
     * Repeti-lo em cada linha e ruido — e custava uma consulta a mais.
     */
    it('com o nome de uma vendedora, as linhas nao repetem o nome dela', async () => {
      conversas.entre.mockResolvedValue([
        { vendedoraId: 'vd-1', clienteId: 'cl-1', ultimaMensagemEm: minutosAtras(2) },
      ]);
      clientes.buscarPorId.mockResolvedValue({ nome: 'Patrícia Lima' });

      const r = await servico.montar().gestaoConversasAgora({ vendedora: 'Marina' });

      expect(r.status).toBe('OK');
      expect(r.vendedora).toBe('Marina Albuquerque');
      expect(conversas.entre.mock.calls[0][2]).toBe('vd-1');
      expect(r.linhas[1]).toBe('Patrícia Lima — última mensagem há 2 min');
      expect(vendedoras.listar).not.toHaveBeenCalled();
    });

    it('sem nome, a gerente so ve o celular da equipe dela', async () => {
      conversas.entre.mockResolvedValue([
        { vendedoraId: 'vd-1', clienteId: null, ultimaMensagemEm: minutosAtras(1) },
        { vendedoraId: 'vd-9', clienteId: null, ultimaMensagemEm: minutosAtras(1) },
      ]);
      vendedoras.listar.mockResolvedValue([
        { id: 'vd-1', nome: 'Marina' },
        { id: 'vd-9', nome: 'Fora da equipe' },
      ]);

      const r = await servico
        .montar({ equipe: ['vd-1'] })
        .gestaoConversasAgora({});

      expect(r.linhas[0]).toContain('1 conversa');
      expect(r.linhas.join('\n')).not.toContain('Fora da equipe');
    });

    it('nenhuma conversa devolve lista vazia, e nao uma linha dizendo zero', async () => {
      const r = await servico.montar().gestaoConversasAgora({});

      expect(r.status).toBe('OK');
      expect(r.linhas).toEqual([]);
    });
  });

  /**
   * O DIA DA VENDEDORA LE DUAS FONTES — 29/09/2026.
   *
   * ======================================================================
   * O DIA ESTAVA VAZIO NUM DIA EM QUE ELA CONVERSOU.
   *
   * A linha do tempo nasce de `atendimentos`, e atendimento exige
   * `cliente_id`. A pessoa nova nao e cliente cadastrada — entao a conversa
   * com ela nao gerava interacao, nao gerava atendimento, e o dia respondia
   * "nao ha registro nenhum".
   *
   * Aconteceu de verdade em 29/09: a Aline conversou com a Patricia as
   * 15:08, o lead nasceu, e o dia dela continuava vazio porque o lead nao
   * fora ENCAMINHADO — nem precisava ser, ja era dela.
   * ======================================================================
   */
  describe('o dia de uma vendedora', () => {
    it('busca nas duas fontes, com a MESMA janela de dia', async () => {
      await servico
        .montar()
        .gestaoDiaDaVendedora({ vendedora: 'Marina', dia: '2026-09-08' });

      expect(linha.doDia).toHaveBeenCalledWith('vd-1', '2026-09-08');

      const [de, ate, id] = conversas.entre.mock.calls[0];
      expect(id).toBe('vd-1');
      expect(de).toEqual(new Date(2026, 8, 8, 0, 0, 0, 0));
      expect(ate).toEqual(new Date(2026, 8, 9, 0, 0, 0, 0));
    });

    /* O caso que provocou a mudanca: zero pontos, uma conversa. */
    it('conversa com pessoa nova NAO deixa mais o dia vazio', async () => {
      linha.doDia.mockResolvedValue([]);
      conversas.entre.mockResolvedValue([
        { vendedoraId: 'vd-1', clienteId: null, ultimaMensagemEm: new Date() },
      ]);

      const r = await servico
        .montar()
        .gestaoDiaDaVendedora({ vendedora: 'Marina' });

      expect(r.status).toBe('OK');
      expect(r.linhas[0]).toBe(
        'Falou com 1 pessoa pelo WhatsApp: 1 número ainda NÃO identificado.',
      );
    });

    it('dia sem ponto e sem conversa continua vazio', async () => {
      const r = await servico
        .montar()
        .gestaoDiaDaVendedora({ vendedora: 'Marina' });

      expect(r.linhas).toEqual([]);
    });
  });

  /**
   * A AGENDA DA EQUIPE — 30/09/2026.
   *
   * ======================================================================
   * NASCEU DE UMA RECUSA QUE PARECIA LIMITE E ERA CONTRATO ESTREITO.
   *
   * Em producao um usuario pediu "a agenda de hoje da equipe toda" e ouviu
   * "nao tenho como puxar de uma vez, me passa os nomes". A agente estava
   * sendo honesta com a ferramenta que existia — ela so aceitava UMA.
   *
   * Fazer o modelo chamar uma vez por vendedora resolveria no papel, e
   * amarraria a resposta ao teto de voltas do laco: com equipe grande ele
   * estouraria e a resposta sairia pela metade.
   * ======================================================================
   */
  describe('agenda da equipe', () => {
    beforeEach(() => {
      vendedoras.listar.mockResolvedValue([
        { id: 'vd-1', nome: 'Marina' },
        { id: 'vd-2', nome: 'Beatriz' },
      ]);
    });

    it('sem nome, traz TODAS numa chamada só', async () => {
      agenda.execute.mockResolvedValue([
        { cliente: 'Karina', quando: new Date(2026, 8, 30, 14, 0), ocasiao: null },
      ]);

      const r = await servico.montar().gestaoAgenda({ periodo: 'HOJE' });

      expect(r.status).toBe('OK');
      expect(r.linhas).toHaveLength(2);
      expect(r.linhas[0]).toContain('Marina:');
      expect(r.linhas[1]).toContain('Beatriz:');
      expect(agenda.execute).toHaveBeenCalledTimes(2);
    });

    /* Omitir quem nao tem nada faria a lista parecer a equipe inteira
     * ocupada, e quem le nao distinguiria "sem compromisso" de "nao
     * consultada". */
    it('quem não tem nada aparece dizendo que não tem', async () => {
      agenda.execute.mockResolvedValue([]);

      const r = await servico.montar().gestaoAgenda({ periodo: 'HOJE' });

      expect(r.linhas).toEqual([
        'Marina: nada agendado.',
        'Beatriz: nada agendado.',
      ]);
    });

    it('"equipe toda" da gerente é a equipe DELA', async () => {
      agenda.execute.mockResolvedValue([]);

      const r = await servico
        .montar({ equipe: ['vd-1'] })
        .gestaoAgenda({ periodo: 'HOJE' });

      expect(r.linhas).toEqual(['Marina: nada agendado.']);
      expect(agenda.execute).toHaveBeenCalledTimes(1);
    });

    it('com nome, continua sendo só aquela pessoa', async () => {
      agenda.execute.mockResolvedValue([]);

      const r = await servico
        .montar()
        .gestaoAgenda({ vendedora: 'Marina', periodo: 'HOJE' });

      expect(r.vendedora).toBe('Marina Albuquerque');
      expect(agenda.execute).toHaveBeenCalledTimes(1);
      expect(agenda.execute).toHaveBeenCalledWith('vd-1', 'HOJE');
      // Nao varreu a equipe para responder por uma so.
      expect(vendedoras.listar).not.toHaveBeenCalled();
    });
  });

  describe('carteira de uma vendedora', () => {
    it('a consulta usa o CODIGO DO ERP, que e o que define a carteira', async () => {
      await servico.montar().gestaoCarteira({ vendedora: 'Marina', meses: 3 });

      // A DATA chega pronta desde 01/10/2026, e nao o numero de meses. O que
      // importa aqui e o CODIGO; o corte em si tem spec proprio em
      // `recorte-de-datas.spec`.
      const [codigo, corte] = carteira.semComprar.mock.calls[0] as [string, Date];
      expect(codigo).toBe('SEED-VD01');
      expect(corte).toBeInstanceOf(Date);
      expect(mesesAtras(corte)).toBe(3);
    });

    it('sem meses informado, usa seis', async () => {
      await servico.montar().gestaoCarteira({ vendedora: 'Marina' });

      const [, corte] = carteira.semComprar.mock.calls[0] as [string, Date];
      expect(mesesAtras(corte)).toBe(6);
    });

    /** O teste do teto. */
    it('devolve o TOTAL junto da amostra', async () => {
      carteira.semComprar.mockResolvedValue({
        clientes: Array.from({ length: 10 }, (_, i) => ({
          nome: `Cliente ${i}`,
          ultimaCompra: null,
          quantidade: 0,
          valorTotal: 0,
        })),
        total: 143,
      });

      const r = await servico.montar().gestaoCarteira({ vendedora: 'Marina' });

      expect(r.status).toBe('OK');
      expect(r.linhas).toHaveLength(10);
      // 143, e nao 10: e o numero que impede a resposta de mentir por omissao.
      expect(r.total).toBe(143);
    });

    it('nome ambiguo para o fluxo antes de consultar carteira nenhuma', async () => {
      resolverVendedora.execute.mockResolvedValue({
        status: 'AMBIGUA',
        nomes: ['Marina Albuquerque', 'Marina Souza'],
      });

      const r = await servico.montar().gestaoCarteira({ vendedora: 'Marina' });

      expect(r.status).toBe('AMBIGUA');
      expect(carteira.semComprar).not.toHaveBeenCalled();
    });

    it('vendedora inexistente devolve a equipe, sem consultar', async () => {
      resolverVendedora.execute.mockResolvedValue({
        status: 'NAO_ENCONTRADA',
        sugestoes: ['Marina Albuquerque', 'Beatriz Nogueira'],
      });

      const r = await servico
        .montar()
        .gestaoCarteira({ vendedora: 'Fernanda' });

      expect(r.status).toBe('NAO_ENCONTRADA');
      expect(r.nomes).toContain('Beatriz Nogueira');
      expect(carteira.semComprar).not.toHaveBeenCalled();
    });
  });

  describe('feedbacks de uma vendedora', () => {
    it('traz a frase dela, e nao um resumo', async () => {
      auditoria.listar.mockResolvedValue({
        total: 1,
        itens: [
          {
            id: 'at-1',
            clienteNome: 'Luana Ferreira',
            etapa: 'EM_NEGOCIACAO',
            abertoEm: new Date('2026-08-24T09:00:00Z'),
            ultimaAtividadeEm: new Date('2026-08-24T11:12:00Z'),
            ultimoRelato: 'Gostou do solitario mas quer ver em ouro rose.',
            aguardandoRelato: false,
          },
        ],
      });

      const r = await servico.montar().gestaoFeedbacks({ vendedora: 'Marina' });

      expect(r.status).toBe('OK');
      // A FRASE DELA, inteira. Resumir aqui seria o modelo repetindo um
      // resumo de um resumo — e o relato existe justamente para nao virar isso.
      expect(r.linhas[0]).toContain(
        'Gostou do solitario mas quer ver em ouro rose.',
      );
      expect(r.linhas[0]).toContain('Luana Ferreira');
    });

    it('sem feedback ainda, DIZ que nao ha — nao devolve linha vazia', async () => {
      auditoria.listar.mockResolvedValue({
        total: 1,
        itens: [
          {
            id: 'at-2',
            clienteNome: 'Queila Silva',
            etapa: 'PRIMEIRO_CONTATO',
            abertoEm: new Date(),
            ultimaAtividadeEm: null,
            ultimoRelato: null,
            aguardandoRelato: true,
          },
        ],
      });

      const r = await servico.montar().gestaoFeedbacks({ vendedora: 'Marina' });

      expect(r.linhas[0]).toContain('ainda sem feedback');
      expect(r.linhas[0]).toContain('aguardando resposta');
    });

    it('com cliente nomeado, abre o episodio inteiro e nao so o ultimo relato', async () => {
      auditoria.listar.mockResolvedValue({
        total: 1,
        itens: [
          { id: 'at-3', clienteNome: 'Luana Ferreira', etapa: 'REMARCADO' },
        ],
      });
      auditoria.detalhe.mockResolvedValue({
        clienteNome: 'Luana Ferreira',
        etapa: 'REMARCADO',
        interacoes: [
          {
            relato: 'Liguei e ela pediu para retornar depois.',
            ocorridoEm: new Date(),
            criadoEm: new Date(),
          },
          { relato: null, ocorridoEm: new Date(), criadoEm: new Date() },
          {
            relato: 'Falei agora, remarcou para amanha as 14h.',
            ocorridoEm: new Date(),
            criadoEm: new Date(),
          },
        ],
      });

      const r = await servico.montar().gestaoFeedbacks({
        vendedora: 'Marina',
        cliente: 'Luana',
      });

      // As DUAS falas, nao so a ultima.
      expect(r.linhas).toHaveLength(2);
      expect(r.linhas[0]).toContain('pediu para retornar');
      expect(r.linhas[1]).toContain('remarcou para amanha');
      expect(auditoria.detalhe).toHaveBeenCalledWith('at-3');
    });

    it('o teto vem com o total junto', async () => {
      auditoria.listar.mockResolvedValue({
        total: 34,
        itens: Array.from({ length: 10 }, (_, i) => ({
          id: 'at-' + i,
          clienteNome: 'Cliente ' + i,
          etapa: 'CONCLUIDO',
          abertoEm: new Date(),
          ultimaAtividadeEm: new Date(),
          ultimoRelato: 'Fechou.',
          aguardandoRelato: false,
        })),
      });

      const r = await servico.montar().gestaoFeedbacks({ vendedora: 'Marina' });

      expect(r.linhas).toHaveLength(10);
      expect(r.total).toBe(34);
    });

    it('nome ambiguo para antes de ler feedback nenhum', async () => {
      resolverVendedora.execute.mockResolvedValue({
        status: 'AMBIGUA',
        nomes: ['Marina Albuquerque', 'Marina Souza'],
      });

      const r = await servico.montar().gestaoFeedbacks({ vendedora: 'Marina' });

      expect(r.status).toBe('AMBIGUA');
      expect(auditoria.listar).not.toHaveBeenCalled();
    });
  });

  describe('melhores clientes de uma vendedora', () => {
    it('repassa categoria e periodo, e devolve o total', async () => {
      carteira.maioresCompradores.mockResolvedValue({
        clientes: [
          { nome: 'Ana', ultimaCompra: null, quantidade: 4, valorTotal: 12000 },
        ],
        total: 27,
      });

      const r = await servico.montar().gestaoMelhores({
        vendedora: 'Marina',
        categoria: 'Anel',
        ultimosMeses: 12,
      });

      expect(carteira.maioresCompradores).toHaveBeenCalledWith('SEED-VD01', {
        categoria: 'Anel',
        ultimosMeses: 12,
      });
      expect(r.total).toBe(27);
      // Com categoria a unidade e PECA, nao compra — sao perguntas diferentes.
      expect(r.linhas[0]).toContain('peças');
    });

    it('sem categoria, a unidade vira compra', async () => {
      carteira.maioresCompradores.mockResolvedValue({
        clientes: [
          { nome: 'Ana', ultimaCompra: null, quantidade: 4, valorTotal: 12000 },
        ],
        total: 4,
      });

      const r = await servico.montar().gestaoMelhores({ vendedora: 'Marina' });

      expect(r.linhas[0]).toContain('compras');
    });
  });

  describe('a equipe, para quem precisa escolher', () => {
    const VD = (
      nome: string,
      statusDisponibilidade: string,
      especialidades: string[] = [],
    ) => ({ nome, statusDisponibilidade, especialidades });

    it('DISPONIVEL primeiro, e ninguém fica de fora', async () => {
      // Esconder quem está de férias faria a usuária procurar um nome que ela
      // sabe que existe.
      vendedoras.listar.mockResolvedValue([
        VD('Beatriz', 'FERIAS'),
        VD('Marina', 'DISPONIVEL'),
        VD('Camila', 'OCUPADA'),
      ]);

      const r = await servico.montar().gestaoVendedoras();

      // A PRIMEIRA LINHA E O RESUMO (29/09/2026): "quantas ativas, quantas
      // com o celular conectado". Ela veio na frente porque e ela que
      // responde a pergunta; os nomes sao o detalhe de quem quiser conferir.
      expect(r.linhas[0]).toContain('3 ativa(s) no cadastro');
      expect(r.linhas.slice(1)).toEqual([
        'Marina — celular NÃO conectado',
        'Beatriz — de férias — celular NÃO conectado',
        'Camila — ocupada — celular NÃO conectado',
      ]);
    });

    /*
     * O CELULAR CONECTADO E O QUE SEPARA "CADASTRADA" DE "ACOMPANHADA".
     *
     * Em 29/09/2026 havia UMA conexao de vendedora em toda a operacao. Sem
     * esta informacao, quem le a lista conclui que o sistema acompanha seis
     * pessoas quando acompanha uma — e toda metrica de atendimento parece
     * quebrada em vez de vazia.
     */
    it('diz quem está com o celular conectado', async () => {
      vendedoras.listar.mockResolvedValue([
        { ...VD('Marina', 'DISPONIVEL'), id: 'vd-1' },
        { ...VD('Camila', 'DISPONIVEL'), id: 'vd-2' },
      ]);
      waha.listarSessoes.mockResolvedValue([
        { nome: 'vend-vd-1', status: 'WORKING' },
        { nome: 'vend-vd-2', status: 'FAILED' },
      ]);

      const r = await servico.montar().gestaoVendedoras();

      expect(r.linhas[0]).toContain('2 ativa(s) no cadastro, 1 com o celular conectado');
      expect(r.linhas[1]).toContain('Marina — celular conectado');
      expect(r.linhas[2]).toContain('Camila — celular NÃO conectado');
    });

    /* NENHUMA conectada e uma resposta diferente de "1 de 6": e o estado em
     * que o sistema nao ve conversa nenhuma, e quem pergunta precisa saber. */
    it('nenhuma conectada diz que o sistema não acompanha as conversas', async () => {
      vendedoras.listar.mockResolvedValue([{ ...VD('Marina', 'DISPONIVEL'), id: 'vd-1' }]);
      waha.listarSessoes.mockResolvedValue([]);

      const r = await servico.montar().gestaoVendedoras();

      expect(r.linhas[0]).toContain('NENHUMA com o celular conectado');
      expect(r.linhas[0]).toContain('não acompanha as conversas');
    });

    /* WAHA fora do ar NAO pode custar a lista: perder os nomes por causa do
     * status seria trocar o principal pelo acessorio. */
    it('WAHA fora do ar ainda devolve os nomes', async () => {
      vendedoras.listar.mockResolvedValue([VD('Marina', 'DISPONIVEL')]);
      waha.listarSessoes.mockRejectedValue(new Error('conexão recusada'));

      const r = await servico.montar().gestaoVendedoras();

      expect(r.linhas[0]).toContain('Não consegui verificar');
      expect(r.linhas[1]).toBe('Marina');
      expect(r.linhas[1]).not.toContain('conectado');
    });

    it('a especialidade entra: é o que ajuda a escolher', async () => {
      vendedoras.listar.mockResolvedValue([
        VD('Marina', 'DISPONIVEL', ['noivado', 'alta joalheria']),
      ]);

      const r = await servico.montar().gestaoVendedoras();

      expect(r.linhas[1]).toBe('Marina — celular NÃO conectado — noivado, alta joalheria');
    });

    it('só as ATIVAS: quem saiu da equipe não é opção', async () => {
      await servico.montar().gestaoVendedoras();

      expect(vendedoras.listar).toHaveBeenCalledWith({ ativo: true });
    });
  });

  describe('a fila de leads esperando encaminhamento', () => {
    const dias = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d;
    };

    it('cada linha diz o que a pessoa quer e HÁ QUANTO TEMPO espera', async () => {
      // A idade é o ponto: o aviso sai uma vez só, então lead esquecido não
      // volta a se anunciar. É ela que separa "chegou agora" de "está parado".
      leads.listarAguardandoGestao.mockResolvedValue([
        {
          nome: 'Nick Tesla',
          produtosDesejados: 'aneis de noivado',
          direcionadoGestaoEm: dias(0),
          criadoEm: dias(0),
        },
        {
          nome: 'Ana Prado',
          produtosDesejados: 'colar de pérolas',
          direcionadoGestaoEm: dias(3),
          criadoEm: dias(5),
        },
      ]);

      const r = await servico.montar().gestaoLeads();

      expect(r.linhas).toEqual([
        'Nick Tesla — aneis de noivado — hoje',
        'Ana Prado — colar de pérolas — há 3 dias',
      ]);
    });

    it('lead sem nome ainda aparece na fila', async () => {
      // Quem sumiu antes de dizer o nome é justamente o que se perde de vista.
      leads.listarAguardandoGestao.mockResolvedValue([
        {
          nome: null,
          produtosDesejados: 'brinco',
          direcionadoGestaoEm: dias(1),
          criadoEm: dias(1),
        },
      ]);

      const r = await servico.montar().gestaoLeads();

      expect(r.linhas[0]).toBe('sem nome informado — brinco — há 1 dia');
    });

    it('a espera cai para a criação quando não houve promoção datada', async () => {
      leads.listarAguardandoGestao.mockResolvedValue([
        {
          nome: 'Bia',
          produtosDesejados: null,
          direcionadoGestaoEm: null,
          criadoEm: dias(2),
        },
      ]);

      const r = await servico.montar().gestaoLeads();

      expect(r.linhas[0]).toBe('Bia — há 2 dias');
    });
  });
  /**
   * O NOME AUSENTE — 29/09/2026.
   *
   * ==========================================================================
   * `required` NO SCHEMA E UM PEDIDO, E NAO UMA GARANTIA.
   *
   * Em 29/09 o Lucas perguntou "quantos clientes tivemos em agosto?" — pergunta
   * sobre a LOJA — e o modelo chamou a ferramenta da VENDEDORA sem nome. O
   * resolvedor estourou no `normalize` de `undefined`, o `catch` de cima virou
   * "Nao consegui consultar isso agora", e a resposta nao ajudou ninguem.
   *
   * SEIS ferramentas tinham o mesmo buraco. Estes testes guardam as seis.
   * ==========================================================================
   */
  describe('as ferramentas que exigem vendedora, chamadas SEM nome', () => {
    const semNome = [undefined, null, '', '   '];

    it.each(semNome)('gestaoVendas com nome %p não estoura', async (nome) => {
      const r = await servico.montar().gestaoVendas({ vendedora: nome as never });
      expect(r.status).toBe('NAO_ENCONTRADA');
    });

    it.each(semNome)('gestaoMetas com nome %p não estoura', async (nome) => {
      const r = await servico.montar().gestaoMetas({ vendedora: nome as never });
      expect(r.status).toBe('NAO_ENCONTRADA');
    });

    /* NAO_ENCONTRADA com lista VAZIA faz o modelo perguntar de qual vendedora
     * se trata — ou perceber que a pergunta era da loja e trocar de ferramenta.
     * Sugerir nomes aqui seria pior: ele escolheria um. */
    it('não sugere nenhum nome quando não houve nome', async () => {
      const r = await servico.montar().gestaoVendas({ vendedora: undefined as never });

      expect(r.nomes).toEqual([]);
      expect(resolverVendedora.execute).not.toHaveBeenCalled();
    });

    it('com nome de verdade, continua resolvendo normalmente', async () => {
      await servico.montar().gestaoVendas({ vendedora: 'Marina' });
      expect(resolverVendedora.execute).toHaveBeenCalledWith('Marina');
    });
  });
  describe('quem compra naquela época — e de quem é a pergunta', () => {
    /**
     * ========================================================================
     * "GERAL SERIA SE FOSSE OS ADMIN" — Lucas, 01/10/2026.
     *
     * A mesma pergunta responde pela carteira de UMA vendedora ou pela loja
     * inteira, e e o `verLoja` que separa as duas. O schema ja obriga o nome
     * quando falta a permissao — isto aqui e a SEGUNDA barreira, porque schema
     * e pedido e nao permissao.
     * ========================================================================
     */
    it('sem ver a loja e sem vendedora, PEDE O NOME — e nao consulta nada', async () => {
      const r = await servico.montar({ verLoja: false }).gestaoEpoca({ mes: 12 });

      expect(r.status).toBe('EXIGE_VENDEDORA');
      // O ponto do teste: a consulta da LOJA nao chega a rodar. Recusar depois
      // de consultar deixaria a clientela carregada em memoria, a um `return`
      // de distancia de vazar numa refatoracao.
      expect(carteira.porEpocaDaLoja).not.toHaveBeenCalled();
      expect(carteira.porEpoca).not.toHaveBeenCalled();
    });

    it('vendedora em branco conta como ausente', async () => {
      const r = await servico
        .montar({ verLoja: false })
        .gestaoEpoca({ mes: 12, vendedora: '   ' });

      expect(r.status).toBe('EXIGE_VENDEDORA');
      expect(carteira.porEpocaDaLoja).not.toHaveBeenCalled();
    });

    it('o padrão do montar já é o escopo estreito — esquecer não abre nada', () => {
      expect(servico.montar().gestaoEpocaExigeVendedora).toBe(true);
      expect(servico.montar({}).gestaoEpocaExigeVendedora).toBe(true);
    });

    it('COM verLoja e sem vendedora, responde pela LOJA', async () => {
      const r = await servico.montar({ verLoja: true }).gestaoEpoca({ mes: 12 });

      expect(r.status).toBe('OK');
      expect(carteira.porEpocaDaLoja).toHaveBeenCalledWith({
        mes: 12,
        dataComemorativa: undefined,
      });
      expect(carteira.porEpoca).not.toHaveBeenCalled();
    });

    it('COM vendedora, é a carteira dela — mesmo para quem vê a loja', async () => {
      await servico
        .montar({ verLoja: true })
        .gestaoEpoca({ vendedora: 'Marina', dataComemorativa: 'Natal' });

      expect(carteira.porEpoca).toHaveBeenCalledWith('SEED-VD01', {
        mes: undefined,
        dataComemorativa: 'Natal',
      });
      expect(carteira.porEpocaDaLoja).not.toHaveBeenCalled();
    });

    it('a linha diz em quantos ANOS a pessoa repetiu', async () => {
      carteira.porEpocaDaLoja.mockResolvedValue({
        total: 2,
        clientes: [
          {
            nome: 'Ana',
            quantidade: 4,
            anos: 3,
            valorTotal: 1000,
            ultimaCompra: new Date(2025, 11, 18),
          },
          {
            nome: 'Bia',
            quantidade: 2,
            anos: 1,
            valorTotal: 500,
            ultimaCompra: null,
          },
        ],
      });

      const r = await servico.montar({ verLoja: true }).gestaoEpoca({ mes: 12 });

      // Habito e coincidencia nao podem sair iguais: quatro compras em tres
      // dezembros nao e a mesma coisa que duas no mesmo dezembro.
      expect(r.linhas[0]).toContain('em 3 anos diferentes');
      expect(r.linhas[1]).toContain('num ano só');
    });
  });


  describe('as vendas uma a uma', () => {
    const VENDA = {
      documento: '1157',
      data: new Date(2026, 8, 23),
      cliente: 'MARIANA MONTENEGRO B MOTA',
      clienteCodigo: '00376',
      vendedora: 'FABY LIMA',
      valor: 149600,
      status: 'concluida',
      itens: [
        { quantidade: 1, nome: 'PIERCING TP 1.39 CTS', valor: 69934.67 },
        { quantidade: 2, nome: 'ANEL ESM 3.25 CTS', valor: 30732.06 },
      ],
    };

    /* ESTE E O TESTE. O resto e contorno. */
    it('sem cliente, sem vendedora e sem documento, PEDE o recorte — e não consulta', async () => {
      const r = await servico.montar().gestaoVendasDetalhadas({ periodo: 'MES' });

      expect(r.status).toBe('EXIGE_RECORTE');
      // Periodo sozinho devolveria a loja inteira do mes, que e outra pergunta.
      // E a recusa acontece ANTES da consulta: recusar depois deixaria a lista
      // carregada em memoria, a um `return` de distancia de vazar.
      expect(vendasDetalhadas).not.toHaveBeenCalled();
    });

    it('nome de cliente com homônimas devolve a LISTA, e não escolhe', async () => {
      clientes.buscarPorNomeParcial.mockResolvedValue([
        { id: 'c-1', nome: 'MARIANA MOTA', codigoErp: '00376' },
        { id: 'c-2', nome: 'MARIANA ARY', codigoErp: '00377' },
      ]);

      const r = await servico.montar().gestaoVendasDetalhadas({ cliente: 'Mariana' });

      expect(r.status).toBe('AMBIGUA');
      expect(r.sobre).toBe('cliente');
      expect(r.nomes).toHaveLength(2);
      expect(r.nomes?.[0]).toContain('00376');
      // Escolher a primeira responderia com confianca sobre a pessoa errada.
      expect(vendasDetalhadas).not.toHaveBeenCalled();
    });

    it('só dígitos é CÓDIGO, e vai direto', async () => {
      clientes.buscarPorCodigoErp.mockResolvedValue({ id: 'c-1', nome: 'MARIANA', codigoErp: '00376' });

      await servico.montar().gestaoVendasDetalhadas({ cliente: '00376' });

      expect(clientes.buscarPorCodigoErp).toHaveBeenCalledWith('00376');
      expect(clientes.buscarPorNomeParcial).not.toHaveBeenCalled();
      expect(vendasDetalhadas).toHaveBeenCalledWith(
        expect.objectContaining({ clienteId: 'c-1' }),
        expect.any(Number),
      );
    });

    it('cliente que não existe não vira lista vazia', async () => {
      clientes.buscarPorNomeParcial.mockResolvedValue([]);

      const r = await servico.montar().gestaoVendasDetalhadas({ cliente: 'Fulana' });

      expect(r.status).toBe('NAO_ENCONTRADA');
      expect(r.sobre).toBe('cliente');
    });

    it('vendedora FORA DA EQUIPE responde como "não achei"', async () => {
      // Dizer "voce nao pode ver a Fulana" confirmaria que a Fulana existe.
      const r = await servico
        .montar({ equipe: ['outra-id'] })
        .gestaoVendasDetalhadas({ vendedora: 'Marina' });

      expect(r.status).toBe('NAO_ENCONTRADA');
      expect(r.sobre).toBe('vendedora');
      expect(vendasDetalhadas).not.toHaveBeenCalled();
    });

    it('a linha traz as PEÇAS, com quantidade inteira e dinheiro em pt-BR', async () => {
      vendasDetalhadas.mockResolvedValue({ vendas: [VENDA], total: 7 });

      const r = await servico.montar().gestaoVendasDetalhadas({ documento: '1157' });

      expect(r.status).toBe('OK');
      expect(r.total).toBe(7);
      // "1x", e nao "1.0000x" — a quantidade e numeric(x,4) no banco.
      expect(r.linhas[0]).toContain('1x PIERCING TP 1.39 CTS');
      expect(r.linhas[0]).toContain('2x ANEL ESM 3.25 CTS');
      // SEM CENTAVOS, como todo valor deste canal (`moeda` arredonda para o
      // real). E o ponto de milhar e brasileiro porque a formatacao acontece no
      // TypeScript — no SQL, o `to_char` usaria a localidade do banco e sairia
      // 'R$ 69,934.67'.
      // SEM O "R$ " NA ASSERCAO: o `toLocaleString` separa o simbolo do numero
      // com ESPACO NAO SEPARAVEL (U+00A0), e a string parece igual no terminal.
      expect(r.linhas[0]).toContain('69.935');
      expect(r.linhas[0]).not.toContain('69,934');
      expect(r.linhas[0]).toContain('00376');
    });

    it('o TOTAL vem junto — dez de trinta e nove não pode parecer tudo', async () => {
      clientes.buscarPorCodigoErp.mockResolvedValue({
        id: 'c-1',
        nome: 'MARIANA',
        codigoErp: '00376',
      });
      vendasDetalhadas.mockResolvedValue({ vendas: [VENDA], total: 39 });

      const r = await servico.montar().gestaoVendasDetalhadas({ cliente: '00376' });

      expect(r.total).toBe(39);
      expect(r.linhas).toHaveLength(1);
    });
  });


  describe('o faturamento por empresa do grupo', () => {
    /**
     * ========================================================================
     * A A.T TEM OITO CNPJs, E TODO NUMERO ERA A SOMA DELES.
     *
     * Perguntada pela receita da MP Comercio, a agente procurou "MP" na lista
     * de CLIENTES — empresa nao existia para ferramenta nenhuma.
     * ========================================================================
     */
    it('sem ver a loja, NÃO consulta — o grupo não tem versão estreita', async () => {
      const r = await servico.montar({ verLoja: false }).gestaoPorEmpresa({});

      expect(r.status).toBe('INDISPONIVEL');
      expect(porEmpresa).not.toHaveBeenCalled();
    });

    it('a ferramenta nem é oferecida a quem não vê a loja', () => {
      // Oferecer e recusar depois seria pior: o modelo anuncia o que nao pode
      // entregar, e a conversa termina em desculpa.
      expect(servico.montar({ verLoja: false }).gestaoPorEmpresaDisponivel).toBe(false);
      expect(servico.montar().gestaoPorEmpresaDisponivel).toBe(false);
      expect(servico.montar({ verLoja: true }).gestaoPorEmpresaDisponivel).toBe(true);
    });

    it('com verLoja, traz TODAS as empresas com movimento', async () => {
      const r = await servico.montar({ verLoja: true }).gestaoPorEmpresa({});

      expect(r.status).toBe('OK');
      expect(r.linhas).toHaveLength(2);
      expect(r.linhas[0]).toContain('AT JEWEL LTDA');
      expect(r.linhas[1]).toContain('MP COMERCIO');
    });

    it('a linha traz receita, vendas e TICKET', async () => {
      const [linha] = (await servico.montar({ verLoja: true }).gestaoPorEmpresa({})).linhas;

      // 61.711.799,82 / 1087 = 56.772,58 — o ticket sai da divisao, e nao do
      // banco, como no resumo.
      expect(linha).toContain('1087 vendas');
      expect(linha).toContain('56.773');
      expect(linha).toContain('92 devoluções');
    });

    it('sem período, pede o histórico inteiro', async () => {
      await servico.montar({ verLoja: true }).gestaoPorEmpresa({});

      expect(porEmpresa).toHaveBeenCalledWith(undefined, undefined, undefined);
    });

    it('empresa sem venda no recorte não divide por zero', async () => {
      porEmpresa.mockResolvedValue([
        { empresa: 'AT HOME LTDA', vendas: 0, receita: -1500, devolucoes: 1 },
      ]);

      const [linha] = (await servico.montar({ verLoja: true }).gestaoPorEmpresa({})).linhas;

      expect(linha).toContain('0 vendas');
      expect(linha).not.toContain('NaN');
    });
  });

  /**
   * ========================================================================
   * CRIAR CATÁLOGO PELA CONVERSA — 22/10/2026.
   *
   * *"Vamos colocar para ela criar também o catálogo pelo WhatsApp; você pega
   * as informações importantes."*
   *
   * E a importante é UMA — o nome. A primeira versão pedia também o estilo,
   * e ele cortou no mesmo dia: *"pergunta o básico, nome do catálogo; o resto
   * deixa padrão e depois ela muda"*. Uma pergunta a mais por catálogo parece
   * pouco, e é exatamente o que transforma conversa em formulário.
   *
   * O padrão não é ausência: sem observação a montagem sai branca, grade de
   * oito — decisão dele em 16/09.
   * ========================================================================
   */
  describe('criar catálogo pela conversa', () => {
    const comPermissao = () => servico.montar({ podeCatalogo: true });

    /* ESTE É O TESTE DO ESCOPO: ausência de caminho, não recusa. */
    it('sem catalogo:write a ferramenta NEM EXISTE', () => {
      expect(servico.montar({}).gestaoCriarCatalogo).toBeUndefined();
      expect(comPermissao().gestaoCriarCatalogo).toBeDefined();
    });

    it('sem nome, não cria nada', async () => {
      const r = await comPermissao().gestaoCriarCatalogo!({ nome: '  ' });

      expect(criarCat.execute).not.toHaveBeenCalled();
      expect(r.mensagem).toContain('nome');
    });

    // ======================================================================
    // SÓ O NOME — e ele já nasce recebendo foto.
    //
    // *"Pergunta o básico, nome do catálogo; o resto deixa padrão e depois
    // ela muda."* Um catálogo que ela acabou de pedir e que não recebe foto
    // seria pior que não ter criado.
    // ======================================================================
    it('só com o nome, cria e já LIBERA', async () => {
      const r = await comPermissao().gestaoCriarCatalogo!({
        nome: 'Dia das Mães',
      });

      expect(criarCat.execute).toHaveBeenCalledTimes(1);
      // Sem estilo não se inventa observação: observação vira TEMA, e o
      // padrão da casa é justamente não ter tema — branco, grade de oito.
      expect(anexarRef.texto).not.toHaveBeenCalled();
      expect(atualizarCat.execute).toHaveBeenCalledWith('cat-1', {
        status: 'COLETANDO',
      });
      expect(r.mensagem).toContain('0042');
      expect(r.mensagem).not.toMatch(/rascunho/i);
    });

    it('e o tema nasce vazio — padrão é ausência de tema', async () => {
      await comPermissao().gestaoCriarCatalogo!({ nome: 'Alianças' });

      expect(criarCat.execute).toHaveBeenCalledWith(
        expect.objectContaining({ tema: null }),
      );
    });

    it('com estilo, cria, guarda a referência e libera', async () => {
      const r = await comPermissao().gestaoCriarCatalogo!({
        nome: 'Dia das Mães',
        estilo: 'fundo claro, luz suave, peça centralizada',
      });

      expect(anexarRef.texto).toHaveBeenCalledWith(
        'cat-1',
        'OBSERVACAO',
        'fundo claro, luz suave, peça centralizada',
      );
      expect(atualizarCat.execute).toHaveBeenCalledWith('cat-1', {
        status: 'COLETANDO',
      });
      expect(r.mensagem).toContain('0042');
    });

    it('o catálogo nasce COM DONO', async () => {
      await servico
        .montar({ podeCatalogo: true, usuarioId: 'ad-7', solicitante: 'Lucas' })
        .gestaoCriarCatalogo!({ nome: 'Alianças' });

      expect(criarCat.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          criadoPorUserId: 'ad-7',
          criadoPorNomeFallback: 'Lucas',
        }),
      );
    });

    // 9:16 é o do story, e é o caso comum. Formato que o modelo invente não
    // vira coluna no banco — cai no padrão, como o formato do relatório.
    it.each([
      [undefined, '9:16'],
      ['16:9', '16:9'],
      ['quadrado', '9:16'],
    ])('formato %s vira %s', async (pedido, esperado) => {
      await comPermissao().gestaoCriarCatalogo!({
        nome: 'Alianças',
        formato: pedido,
      });

      expect(criarCat.execute).toHaveBeenCalledWith(
        expect.objectContaining({ formato: esperado }),
      );
    });

    /**
     * ======================================================================
     * "COLOCA ESSAS PEÇAS NO CATÁLOGO" — RF32, 22/10/2026.
     *
     *   — "me lista colar de até 10 mil"   (a lista sai)
     *   — "coloca essas peças no catálogo com o nome de under 10k"
     *
     * E "essas" sai da ÚLTIMA LISTA, não do modelo: os códigos são lidos da
     * tabela que a própria ferramenta guardou. Se o modelo os redigitasse,
     * uma lista de doze poderia voltar com dez, e o catálogo sairia com duas
     * peças a menos sem ninguém notar.
     * ======================================================================
     */
    describe('as peças da última lista', () => {
      const comLista = (linhas: Record<string, string>[]) =>
        ultimoRel.pegar.mockReturnValue({
          titulo: 'Peças',
          colunas: [{ chave: 'o', titulo: 'Peças' }],
          linhas,
        });

      const UMA_PECA = {
        id: 'p-1',
        codigoErp: 'CO26217',
        descricaoEtiqueta: 'Colar Riv. Coroa',
        valorVenda: 9900,
      };

      /* ESTE É O TESTE: o código vem do dado, não do modelo. */
      it('lê os códigos da tabela guardada, e não do que o modelo digitou', async () => {
        comLista([
          { o: 'Colar Riv. Coroa — código CO26217: R$ 9.900,00, disponível' },
          { o: 'Colar DTS — código CO26229: R$ 8.000,00, disponível' },
        ]);
        produtosRepo.findByCodigoErp.mockResolvedValue(UMA_PECA);
        fotosDaPeca.listar.mockResolvedValue([
          { arquivoId: 'arq-1', mime: 'image/jpeg' },
        ]);

        await comPermissao().gestaoCriarCatalogo!({
          nome: 'under 10k',
          usarUltimaLista: true,
        });

        expect(
          produtosRepo.findByCodigoErp.mock.calls.map((c) => c[0]),
        ).toEqual(['CO26217', 'CO26229']);
      });

      it('todas as fotos da peça entram — foi a letra (a)', async () => {
        comLista([{ o: 'código CO26217: R$ 9.900,00' }]);
        produtosRepo.findByCodigoErp.mockResolvedValue(UMA_PECA);
        fotosDaPeca.listar.mockResolvedValue([
          { arquivoId: 'a1', mime: 'image/jpeg' },
          { arquivoId: 'a2', mime: 'image/png' },
          { arquivoId: 'a3', mime: 'image/jpeg' },
        ]);

        const r = await comPermissao().gestaoCriarCatalogo!({
          nome: 'under 10k',
          usarUltimaLista: true,
        });

        expect(catalogosRepo.criarFoto).toHaveBeenCalledTimes(3);
        // Aponta para o arquivo que JÁ existe: nada é baixado nem reenviado.
        expect(catalogosRepo.criarFoto).toHaveBeenCalledWith(
          expect.objectContaining({
            catalogoId: 'cat-1',
            codigoErp: 'CO26217',
            arquivoId: 'a1',
            arquivoOriginalId: 'a1',
            precoAVista: 9900,
          }),
        );
        expect(r.mensagem).toContain('3 foto');
      });

      // ====================================================================
      // O QUE FICOU DE FORA É DITO. Peça sem foto cadastrada é o caso comum
      // desta base — catálogo menor que a lista precisa dizer por quê.
      // ====================================================================
      it('peça sem foto fica de fora, e a frase diz qual', async () => {
        comLista([{ o: 'código CO26217' }, { o: 'código AN23341' }]);
        produtosRepo.findByCodigoErp.mockImplementation((c: string) =>
          Promise.resolve({ ...UMA_PECA, codigoErp: c }),
        );
        fotosDaPeca.listar.mockResolvedValue([]);

        const r = await comPermissao().gestaoCriarCatalogo!({
          nome: 'under 10k',
          usarUltimaLista: true,
        });

        expect(catalogosRepo.criarFoto).not.toHaveBeenCalled();
        expect(r.mensagem).toContain('CO26217');
        expect(r.mensagem).toContain('AN23341');
        expect(r.mensagem).toMatch(/sem foto/i);
      });

      it('código que o modelo invente não vira peça — vira "não achei"', async () => {
        produtosRepo.findByCodigoErp.mockResolvedValue(null);

        const r = await comPermissao().gestaoCriarCatalogo!({
          nome: 'under 10k',
          pecas: ['XX99999'],
        });

        expect(catalogosRepo.criarFoto).not.toHaveBeenCalled();
        expect(r.mensagem).toMatch(/não achei/i);
        expect(r.mensagem).toContain('XX99999');
      });

      it('sem lista guardada, o catálogo sai vazio — e ele existe', async () => {
        ultimoRel.pegar.mockReturnValue(null);

        const r = await comPermissao().gestaoCriarCatalogo!({
          nome: 'under 10k',
          usarUltimaLista: true,
        });

        expect(catalogosRepo.criarFoto).not.toHaveBeenCalled();
        expect(r.mensagem).toContain('criado');
      });
    });

    /**
     * ======================================================================
     * O PDF DO CATÁLOGO — RF47, 22/10/2026.
     *
     * É o trabalho que hoje sai do sistema e vai para o ChatGPT. O catálogo
     * é achado como ela o chama: pelo número ou pelo nome.
     * ======================================================================
     */
    describe('o PDF do catálogo', () => {
      it.each([['0042'], ['42'], ['#0042'], ['under 25k'], ['Under 25K']])(
        'acha o catálogo por "%s"',
        async (dito) => {
          const r = await comPermissao().gestaoPdfDoCatalogo!({
            catalogo: dito,
          });

          expect(pdfDeFotos.execute).toHaveBeenCalledWith('cat-1', null, null);
          expect(r.arquivo?.nome).toBe('catalogo-0042-under-25k.pdf');
          expect(r.mensagem).toContain('3 páginas');
        },
      );

      it('a capa escolhida vai junto', async () => {
        await comPermissao().gestaoPdfDoCatalogo!({
          catalogo: '0042',
          capa: 'CO26217',
        });

        expect(pdfDeFotos.execute).toHaveBeenCalledWith('cat-1', 'CO26217', null);
      });

      // ====================================================================
      // E O TEXTO DA CAPA TAMBÉM — *"tira o Under 25k e coloca News"*.
      // ====================================================================
      it('o texto pedido para a capa chega ao montador', async () => {
        await comPermissao().gestaoPdfDoCatalogo!({
          catalogo: '0042',
          textoCapa: 'News',
        });

        expect(pdfDeFotos.execute).toHaveBeenCalledWith('cat-1', null, 'News');
      });

      // A capa é escolhida por padrão, e escolha calada é escolha que
      // ninguém revisa: a frase conta qual peça abriu e o que ficou escrito.
      it('a resposta DIZ qual capa saiu e o que foi escrito', async () => {
        pdfDeFotos.execute.mockResolvedValue({
          conteudo: Buffer.from('%PDF-1.3'),
          nome: 'catalogo-0042.pdf',
          paginas: 4,
          cortadas: 0,
          capa: { codigo: 'CO26217', texto: 'News', enviada: false },
        });

        const r = await comPermissao().gestaoPdfDoCatalogo!({
          catalogo: '0042',
        });

        expect(r.mensagem).toContain('CO26217');
        expect(r.mensagem).toContain('News');
        expect(r.mensagem).toMatch(/trocar a foto/i);
        // E O CONVITE DA CAPA QUE NAO E PECA — RF47, 23/10/2026: a capa que
        // ela quer pode nao ser nenhuma das pecas, e esse caminho so existe
        // se alguem contar que ele existe.
        expect(r.mensagem).toMatch(/essa é a capa/i);
      });

      /*
       * A CAPA ENVIADA TEM OUTRA FRASE — e nao e capricho: dizer "a capa é a
       * foto da CO26217" sobre uma imagem que nao e peca nenhuma mandaria ela
       * procurar um codigo que nao existe. E quem ja tem capa propria nao
       * precisa ouvir o convite para mandar uma.
       */
      it('capa enviada: a frase diz que é a imagem dela, e não uma peça', async () => {
        pdfDeFotos.execute.mockResolvedValue({
          conteudo: Buffer.from('%PDF-1.3'),
          nome: 'catalogo-0042.pdf',
          paginas: 4,
          cortadas: 0,
          capa: { codigo: null, texto: 'News', enviada: true },
        });

        const r = await comPermissao().gestaoPdfDoCatalogo!({
          catalogo: '0042',
        });

        expect(r.mensagem).toMatch(/IMAGEM DE CAPA/i);
        expect(r.mensagem).toContain('News');
        expect(r.mensagem).not.toMatch(/trocar a foto/i);
      });

      // ====================================================================
      // DOIS COM O MESMO NOME NÃO VIRAM PALPITE — PDF do catálogo errado sai
      // para a cliente, e ninguém confere dez páginas.
      // ====================================================================
      it('nome que serve a dois catálogos não escolhe nenhum', async () => {
        catalogosRepo.listarAbertos.mockResolvedValue([
          { id: 'cat-1', numero: '0042', nome: 'Under 25k' },
          { id: 'cat-2', numero: '0043', nome: 'Under 25k — outubro' },
        ]);

        const r = await comPermissao().gestaoPdfDoCatalogo!({
          catalogo: 'under 25k',
        });

        expect(pdfDeFotos.execute).not.toHaveBeenCalled();
        expect(r.arquivo).toBeNull();
      });

      it('catálogo que não recebe foto não vira PDF', async () => {
        catalogosRepo.listarAbertos.mockResolvedValue([]);

        const r = await comPermissao().gestaoPdfDoCatalogo!({
          catalogo: '0042',
        });

        expect(r.arquivo).toBeNull();
        expect(r.mensagem).toMatch(/não achei/i);
      });

      it('o corte no teto é DITO, e não calado', async () => {
        pdfDeFotos.execute.mockResolvedValue({
          conteudo: Buffer.from('%PDF-1.3'),
          nome: 'catalogo-0042.pdf',
          paginas: 40,
          cortadas: 5,
        });

        const r = await comPermissao().gestaoPdfDoCatalogo!({
          catalogo: '0042',
        });

        expect(r.mensagem).toContain('5 de fora');
      });

      it('sem catalogo:write, a ferramenta nem existe', () => {
        expect(servico.montar({}).gestaoPdfDoCatalogo).toBeUndefined();
      });
    });

    /**
     * ======================================================================
     * O AJUSTE PELA CONVERSA — RF47, 23/10/2026.
     *
     * *"Ela pode pedir algum ajuste igual como ela pede no painel: muda isso,
     * muda aquilo."*
     *
     * SAO DUAS COISAS, e nao o formulario inteiro: o NOME — que e o texto da
     * capa — e QUAIS PECAS ficam. Tema e formato nao mudam nada neste
     * produto, que empilha as fotos como elas sao.
     *
     * TIRAR NAO APAGA: grava REPROVADA, igual ao botao do painel, e o painel
     * devolve. A imagem fica onde esta — com o RF32 ela pode ser a foto do
     * CADASTRO da peca, e apagar aquilo estragaria os proximos catalogos.
     * ======================================================================
     */
    describe('ajustar o catálogo pela conversa', () => {
      const comPermissao = () => servico.montar({ podeCatalogo: true });

      it('sem catalogo:write a ferramenta NEM EXISTE', () => {
        expect(servico.montar({}).gestaoAjustarCatalogo).toBeUndefined();
        expect(comPermissao().gestaoAjustarCatalogo).toBeDefined();
      });

      it('catálogo que não existe não muda nada', async () => {
        const r = await comPermissao().gestaoAjustarCatalogo!({
          catalogo: '9999',
          nome: 'News',
        });

        expect(atualizarCat.execute).not.toHaveBeenCalled();
        expect(r.mensagem).toContain('Não achei');
      });

      /* O NOME É A CAPA — e é por isso que ele mudou de lugar. */
      it('troca o nome, e diz que é ele que vai na capa', async () => {
        const r = await comPermissao().gestaoAjustarCatalogo!({
          catalogo: '0042',
          nome: 'News',
        });

        expect(atualizarCat.execute).toHaveBeenCalledWith('cat-1', {
          nome: 'News',
        });
        expect(r.mensagem).toContain('News');
        expect(r.mensagem).toContain('capa');
      });

      /* TODAS AS FOTOS DAQUELA PEÇA: com o RF33 uma peça tem várias, e tirar
       * só a primeira deixaria a peça no PDF pelas outras. */
      it('tirar a peça tira TODAS as fotos dela, sem apagar nada', async () => {
        const r = await comPermissao().gestaoAjustarCatalogo!({
          catalogo: '0042',
          tirar: ['an2568'],
        });

        expect(catalogosRepo.atualizarFoto).toHaveBeenCalledTimes(2);
        expect(catalogosRepo.atualizarFoto).toHaveBeenCalledWith('f-1', {
          status: 'REPROVADA',
        });
        expect(catalogosRepo.atualizarFoto).toHaveBeenCalledWith('f-2', {
          status: 'REPROVADA',
        });
        expect(r.mensagem).toContain('AN2568 (2 fotos)');
        expect(r.mensagem).toContain('devolver pelo painel');
      });

      it('peça que não está no catálogo é DITA, e não calada', async () => {
        const r = await comPermissao().gestaoAjustarCatalogo!({
          catalogo: '0042',
          tirar: ['GD5478', 'CO9999'],
        });

        expect(r.mensagem).toContain('tirei GD5478');
        expect(r.mensagem).toContain('não achei CO9999');
      });

      it('os dois ajustes numa frase só', async () => {
        const r = await comPermissao().gestaoAjustarCatalogo!({
          catalogo: 'under 25k',
          nome: 'News',
          tirar: ['GD5478'],
        });

        expect(atualizarCat.execute).toHaveBeenCalled();
        expect(catalogosRepo.atualizarFoto).toHaveBeenCalledWith('f-3', {
          status: 'REPROVADA',
        });
        expect(r.mensagem).toContain('News');
        expect(r.mensagem).toContain('GD5478');
      });

      it('sem nome e sem peça, não mexe em nada e diz isso', async () => {
        const r = await comPermissao().gestaoAjustarCatalogo!({
          catalogo: '0042',
        });

        expect(atualizarCat.execute).not.toHaveBeenCalled();
        expect(catalogosRepo.atualizarFoto).not.toHaveBeenCalled();
        expect(r.mensagem).toContain('nada foi');
      });
    });
  });
});

/**
 * Quantos MESES atras esta a data de corte, arredondado.
 *
 * O handler converte meses em data; o teste faz o caminho de volta para
 * conferir o recorte sem travar no milissegundo em que o teste rodou.
 */
function mesesAtras(corte: Date, agora: Date = new Date()): number {
  const dias = (agora.getTime() - corte.getTime()) / 86_400_000;
  return Math.round(dias / 30.44);
}
