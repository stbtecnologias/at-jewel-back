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
  let carteira: { semComprar: jest.Mock; maioresCompradores: jest.Mock };
  let agendarGestao: { execute: jest.Mock };
  let auditoria: { listar: jest.Mock; detalhe: jest.Mock };
  let linha: { doDia: jest.Mock };
  let waha: { listarSessoes: jest.Mock };
  let vendedoras: {
    listar: jest.Mock;
    buscarPorCodigoErp: jest.Mock;
    buscarPorId: jest.Mock;
  };
  let clientes: { buscarPorNomeParcial: jest.Mock };
  let leads: { listarAguardandoGestao: jest.Mock };
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
    clientes = { buscarPorNomeParcial: jest.fn().mockResolvedValue([]) };
    leads = { listarAguardandoGestao: jest.fn().mockResolvedValue([]) };

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
    );
  });

  describe('carteira de uma vendedora', () => {
    it('a consulta usa o CODIGO DO ERP, que e o que define a carteira', async () => {
      await servico.montar().gestaoCarteira({ vendedora: 'Marina', meses: 3 });

      expect(carteira.semComprar).toHaveBeenCalledWith('SEED-VD01', 3);
    });

    it('sem meses informado, usa seis', async () => {
      await servico.montar().gestaoCarteira({ vendedora: 'Marina' });

      expect(carteira.semComprar).toHaveBeenCalledWith('SEED-VD01', 6);
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
});
