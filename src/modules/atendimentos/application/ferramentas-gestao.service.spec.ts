import { FerramentasGestaoService } from './ferramentas-gestao.service';

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
  let clientes: { buscarPorNomeParcial: jest.Mock; buscarPorId: jest.Mock };
  let leads: { listarAguardandoGestao: jest.Mock };
  let conversas: { entre: jest.Mock };
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
    };
    leads = { listarAguardandoGestao: jest.fn().mockResolvedValue([]) };
    conversas = { entre: jest.fn().mockResolvedValue([]) };

    servico = new FerramentasGestaoService(
      resolverVendedora as never,
      // A consulta de venda, que desde 25/09 le a MOVIMENTACAO. Dublada aqui:
      // estes testes descrevem o roteamento das ferramentas, nao o SQL.
      { itens: jest.fn().mockResolvedValue({ linhas: [] }) } as never,
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
