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
  let vendedoras: { listar: jest.Mock; buscarPorCodigoErp: jest.Mock; buscarPorId: jest.Mock };
  let clientes: { buscarPorNomeParcial: jest.Mock };
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
      vendas: jest.fn().mockResolvedValue({ quantidade: 0, receita: 0, ticketMedio: 0 }),
      metas: jest.fn().mockResolvedValue([]),
    };
    carteira = {
      semComprar: jest.fn().mockResolvedValue({ clientes: [], total: 0 }),
      maioresCompradores: jest.fn().mockResolvedValue({ clientes: [], total: 0 }),
    };
    agendarGestao = { execute: jest.fn() };
    auditoria = {
      listar: jest.fn().mockResolvedValue({ itens: [], total: 0 }),
      detalhe: jest.fn(),
    };
    vendedoras = {
      listar: jest.fn().mockResolvedValue([]),
      buscarPorCodigoErp: jest.fn().mockResolvedValue(null),
      buscarPorId: jest.fn().mockResolvedValue(null),
    };
    clientes = { buscarPorNomeParcial: jest.fn().mockResolvedValue([]) };

    servico = new FerramentasGestaoService(
      resolverVendedora as never,
      agenda as never,
      desempenho as never,
      carteira as never,
      agendarGestao as never,
      auditoria as never,
      vendedoras as never,
      clientes as never,
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

      const r = await servico.montar().gestaoCarteira({ vendedora: 'Fernanda' });

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
      expect(r.linhas[0]).toContain('Gostou do solitario mas quer ver em ouro rose.');
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
        itens: [{ id: 'at-3', clienteNome: 'Luana Ferreira', etapa: 'REMARCADO' }],
      });
      auditoria.detalhe.mockResolvedValue({
        clienteNome: 'Luana Ferreira',
        etapa: 'REMARCADO',
        interacoes: [
          { relato: 'Liguei e ela pediu para retornar depois.', ocorridoEm: new Date(), criadoEm: new Date() },
          { relato: null, ocorridoEm: new Date(), criadoEm: new Date() },
          { relato: 'Falei agora, remarcou para amanha as 14h.', ocorridoEm: new Date(), criadoEm: new Date() },
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
        clientes: [{ nome: 'Ana', ultimaCompra: null, quantidade: 4, valorTotal: 12000 }],
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
        clientes: [{ nome: 'Ana', ultimaCompra: null, quantidade: 4, valorTotal: 12000 }],
        total: 4,
      });

      const r = await servico.montar().gestaoMelhores({ vendedora: 'Marina' });

      expect(r.linhas[0]).toContain('compras');
    });
  });
});
