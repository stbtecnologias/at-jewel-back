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
