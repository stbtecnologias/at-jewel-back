import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { FerramentasVendedoraService } from './ferramentas-vendedora.service';

const SEM_FOTOS = {
  buscar: async () => ({ fotos: [], tinhamUrl: 0, cortadas: 0 }),
} as never;

const PAGINA = {
  pecas: 59,
  valor: 11_705_495,
  devolvidas: 3,
  porVendedora: [{ nome: 'Ylka Franck', pecas: 24, valor: 4_835_095 }],
  linhas: [
    {
      codigoErp: 'BR25120',
      descricao: 'BRINCO DTS',
      valorUnitario: 415_520,
      quantidade: 1,
      quando: new Date('2025-02-14T12:00:00'),
      clienteNome: 'Cliente Um',
      vendedoraNome: 'Ylka Franck',
    },
  ],
  totalDeLinhas: 59,
  deslocamento: 0,
};

/**
 * ============================================================================
 * AS PEÇAS POR FAIXA DE VALOR, PELAS DUAS AGENTES — 13/10/2026.
 *
 * O que este arquivo protege:
 *
 * 1. A VENDEDORA SÓ VÊ O QUE ELA VENDEU. O `vendedoraId` entra por closure,
 *    do telefone resolvido antes da conversa, e a ferramenta não tem campo de
 *    escopo. Medido na base: ela vê 24 peças acima de 100 mil em 2025 e a
 *    loja vê 59 — se um dia os dois números empatarem, o escopo caiu.
 *
 * 2. SEM `vendedoraId`, VAZIO — e nunca a loja. O repositório abre o filtro
 *    inteiro quando o id é nulo (`$5::uuid IS NULL`), então o nulo é barrado
 *    no handler, antes de chegar lá.
 *
 * 3. FAIXA VAZIA NÃO CONSULTA. Sem mínimo nem máximo a resposta seria o
 *    histórico inteiro, verdadeira e inútil, com cara de resposta à pergunta
 *    que ninguém fez.
 * ============================================================================
 */
describe('as peças por faixa de valor', () => {
  describe('pela Helena, no canal da vendedora', () => {
    let vendas: { pecasPorFaixa: jest.Mock };
    let servico: FerramentasVendedoraService;

    beforeEach(() => {
      vendas = { pecasPorFaixa: jest.fn().mockResolvedValue(PAGINA) };
      servico = new FerramentasVendedoraService(
        { execute: jest.fn() } as never,
        { vendas: jest.fn(), metas: jest.fn() } as never,
        { execute: jest.fn() } as never,
        { semComprar: jest.fn(), maioresCompradores: jest.fn(), porFidelidade: jest.fn() } as never,
        { execute: jest.fn() } as never,
        { execute: jest.fn() } as never,
        { resumo: jest.fn(), listar: jest.fn() } as never,
        { listarPorVendedora: jest.fn().mockResolvedValue([]) } as never,
        { execute: jest.fn() } as never,
        vendas as never,
      // RF36/RF37: guarda a tabela para virar arquivo. Mudo nestes testes.
      { guardar: jest.fn(), pegar: jest.fn() } as never,
      // RF38: o dossie da estrategia. Mudo aqui.
      { montar: jest.fn().mockResolvedValue('dossie') } as never,
      );
    });

    const montar = (vendedoraId: string | null = 'vd-1') =>
      servico.montar({ vendedoraId: vendedoraId as never, codigoErp: 'SEED-VD01' });

    /* ESTE É O TESTE. */
    it('consulta SÓ as vendas dela, pelo id que veio por closure', async () => {
      await montar().minhasPecasPorValor({
        valorMinimo: 100000,
        de: '2025-01-01',
        ate: '2025-12-31',
      });

      expect(vendas.pecasPorFaixa).toHaveBeenCalledWith(
        expect.objectContaining({ vendedoraId: 'vd-1' }),
      );
    });

    it('NÃO tem campo de escopo — a aridade é a garantia', () => {
      // Um objeto com faixa, período e página, e nada de "de quem": não há
      // campo para o modelo preencher com o nome de uma colega.
      expect(montar().minhasPecasPorValor.length).toBe(1);
    });

    it('sem id de vendedora devolve VAZIO, e nunca a loja', async () => {
      const r = await montar(null).minhasPecasPorValor({ valorMinimo: 100000 });

      // O teste que pega a "simplificação": passar o nulo adiante abriria o
      // filtro inteiro no SQL.
      expect(vendas.pecasPorFaixa).not.toHaveBeenCalled();
      expect(r.pecas).toBe(0);
      expect(r.faixaInvalida).toBe(true);
    });

    it('faixa sem valor nenhum NÃO consulta', async () => {
      vendas.pecasPorFaixa.mockResolvedValue(null);

      const r = await montar().minhasPecasPorValor({ de: '2025-01-01', ate: '2025-12-31' });

      expect(r.faixaInvalida).toBe(true);
      expect(r.pecas).toBe(0);
    });

    it('o recorte volta em palavras, para a resposta dizer o corte', async () => {
      const r = await montar().minhasPecasPorValor({
        valorMinimo: 100000,
        de: '2025-01-01',
        ate: '2025-12-31',
      });

      expect(r.recorte).toContain('acima de');
      expect(r.recorte).toContain('31/12/2025');
    });

    it('as devolvidas vêm junto, e NÃO descontadas', async () => {
      const r = await montar().minhasPecasPorValor({ valorMinimo: 100000 });

      expect(r.pecas).toBe(59);
      expect(r.devolvidas).toBe(3);
    });
  });

  describe('pela Anastasia, no canal da gestão', () => {
    let vendas: { pecasPorFaixa: jest.Mock };
    let resolverVendedora: { execute: jest.Mock };
    let servico: FerramentasGestaoService;

    beforeEach(() => {
      vendas = { pecasPorFaixa: jest.fn().mockResolvedValue(PAGINA) };
      resolverVendedora = {
        execute: jest.fn().mockResolvedValue({
          status: 'OK',
          id: 'vd-1',
          nome: 'Ylka Franck',
          codigoErp: 'SEED-VD02',
        }),
      };
      servico = new FerramentasGestaoService(
        resolverVendedora as never,
        vendas as never,
        { execute: jest.fn() } as never,
        { execute: jest.fn() } as never,
        { porMes: jest.fn(), porPeriodo: jest.fn() } as never,
        { porRecorte: jest.fn(), porDatas: jest.fn() } as never,
        { vendedoraDaSessao: (s: string) => s } as never,
        { listarSessoes: jest.fn().mockResolvedValue([]) } as never,
        { itens: jest.fn() } as never,
        { execute: jest.fn() } as never,
        SEM_FOTOS,
        { execute: jest.fn() } as never,
        { vendas: jest.fn(), metas: jest.fn() } as never,
        { semComprar: jest.fn(), maioresCompradores: jest.fn(), porFidelidade: jest.fn() } as never,
        { execute: jest.fn() } as never,
        { resumo: jest.fn(), listar: jest.fn() } as never,
        { doDia: jest.fn() } as never,
        { execute: jest.fn() } as never,
        { listar: jest.fn(), buscarPorId: jest.fn() } as never,
        { buscarPorNomeParcial: jest.fn() } as never,
        { listarAguardandoGestao: jest.fn() } as never,
        { entre: jest.fn().mockResolvedValue([]) } as never,
      { listar: jest.fn().mockResolvedValue([]) } as never,
      // RF36/RF37: guarda a tabela para virar arquivo. Mudo nestes testes.
      { guardar: jest.fn(), pegar: jest.fn() } as never,
      // 22/10: criar catalogo pela conversa. Mudos nestes testes.
      { execute: jest.fn() } as never,
      { texto: jest.fn() } as never,
      { execute: jest.fn() } as never,
      // RF32: as pecas da lista entrando no catalogo.
      { findByCodigoErp: jest.fn() } as never,
      { criarFoto: jest.fn() } as never,
      // RF38: o dossie da estrategia de vendas.
      { montar: jest.fn().mockResolvedValue('dossie') } as never,
      // RF47: o catalogo em PDF. Mudo nestes testes.
      { execute: jest.fn() } as never,
        // O repositorio de empresas — 26/10/2026, as vendas por filial.
        { listar: jest.fn().mockResolvedValue([]) } as never,
      );
    });

    it('SEM nome de vendedora, a pergunta é da LOJA', async () => {
      const r = await servico.montar().gestaoPecasPorValor({
        valorMinimo: 100000,
        de: '2025-01-01',
        ate: '2025-12-31',
      });

      // Sem `vendedoraId`: a loja inteira.
      expect(vendas.pecasPorFaixa).toHaveBeenCalledWith(
        expect.not.objectContaining({ vendedoraId: expect.anything() }),
      );
      expect(r.pecas).toBe(59);
      expect(r.status).toBe('OK');
    });

    it('e a QUEBRA POR VENDEDORA vem sempre, sem ferramenta separada', async () => {
      // "Qual vendedora vendeu mais acima de 150 mil" é a mesma consulta.
      const r = await servico.montar().gestaoPecasPorValor({ valorMinimo: 150000 });

      expect(r.porVendedora.length).toBeGreaterThan(0);
      expect(r.porVendedora[0]).toContain('Ylka Franck');
    });

    it('COM nome, recorta na vendedora resolvida', async () => {
      const r = await servico
        .montar()
        .gestaoPecasPorValor({ valorMinimo: 100000, vendedora: 'Ylka' });

      expect(vendas.pecasPorFaixa).toHaveBeenCalledWith(
        expect.objectContaining({ vendedoraId: 'vd-1' }),
      );
      expect(r.vendedora).toBe('Ylka Franck');
    });

    it('vendedora fora da equipe não é alcançada', async () => {
      const r = await servico
        .montar({ equipe: ['vd-99'] })
        .gestaoPecasPorValor({ valorMinimo: 100000, vendedora: 'Ylka' });

      expect(vendas.pecasPorFaixa).not.toHaveBeenCalled();
      expect(r.status).toBe('NAO_ENCONTRADA');
    });

    it('nome ambíguo pergunta qual, e não consulta', async () => {
      resolverVendedora.execute.mockResolvedValue({
        status: 'AMBIGUA',
        nomes: ['Ylka Franck', 'Ylka Moura'],
      });

      const r = await servico
        .montar()
        .gestaoPecasPorValor({ valorMinimo: 100000, vendedora: 'Ylka' });

      expect(vendas.pecasPorFaixa).not.toHaveBeenCalled();
      expect(r.status).toBe('AMBIGUA');
      expect(r.nomes).toEqual(['Ylka Franck', 'Ylka Moura']);
    });

    it('faixa sem valor nenhum NÃO consulta', async () => {
      vendas.pecasPorFaixa.mockResolvedValue(null);

      const r = await servico
        .montar()
        .gestaoPecasPorValor({ de: '2025-01-01', ate: '2025-12-31' });

      expect(r.faixaInvalida).toBe(true);
    });
  });
});
