import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { FerramentasVendedoraService } from './ferramentas-vendedora.service';

const SEM_FOTOS = {
  buscar: async () => ({ fotos: [], tinhamUrl: 0, cortadas: 0 }),
} as never;

/**
 * OS CLIENTES OURO PELAS DUAS AGENTES — 09/10/2026.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE.
 *
 * 1. O ESCOPO É ESCRITO, NUNCA DERIVADO DE AUSÊNCIA. A vendedora recebe
 *    `{ tipo: 'CARTEIRA' }`; só a gestão pode escrever `{ tipo: 'LOJA' }`. Se
 *    um dia alguém "simplificar" passando o código e deixando nulo significar
 *    a loja, a vendedora sem cadastro no ERP passa a ver a base inteira — e
 *    nada na resposta diria isso.
 *
 * 2. NÍVEL INVENTADO NÃO CONSULTA. "Diamante" tem de voltar como
 *    `nivelDesconhecido`, e não como lista vazia: vazio soa como "você não
 *    tem nenhum", que é falso.
 *
 * 3. OS SEM DONA SE ANUNCIAM. 19 dos 48 clientes Ouro não têm
 *    `vendedora_codigo_erp` — medido em 09/10. Se o número não chegar ao
 *    texto, a gestão soma as carteiras, acha 29 e vai embora achando que viu
 *    a loja.
 * ==========================================================================
 */
describe('os clientes por fidelidade', () => {
  const pagina = (parcial: Record<string, unknown> = {}) => ({
    clientes: [
      {
        id: 'c-1',
        nome: 'Carla Oliveira',
        nivel: 'Ouro' as const,
        compras: 9,
        valorLiquido: 1148377,
        ultimaCompra: new Date('2026-08-12T12:00:00Z'),
        vendedoraNome: 'Marina',
      },
    ],
    total: 48,
    deslocamento: 0,
    semVendedora: 19,
    ...parcial,
  });

  describe('pela Helena, no canal da vendedora', () => {
    let carteira: { porFidelidade: jest.Mock };
    let servico: FerramentasVendedoraService;

    beforeEach(() => {
      carteira = { porFidelidade: jest.fn().mockResolvedValue(pagina()) };
      servico = new FerramentasVendedoraService(
        { execute: jest.fn() } as never,
        { vendas: jest.fn(), metas: jest.fn() } as never,
        { execute: jest.fn() } as never,
        {
          semComprar: jest.fn(),
          maioresCompradores: jest.fn(),
          porFidelidade: carteira.porFidelidade,
        } as never,
        { execute: jest.fn() } as never,
        { execute: jest.fn() } as never,
        { resumo: jest.fn(), listar: jest.fn() } as never,
        { listarPorVendedora: jest.fn().mockResolvedValue([]) } as never,
        { execute: jest.fn() } as never,
      );
    });

    const montar = (codigoErp: string | null = 'SEED-VD01') =>
      servico.montar({ vendedoraId: 'vd-1', codigoErp });

    it('consulta a CARTEIRA dela, pelo código que veio por closure', async () => {
      await montar().clientesPorFidelidade({ nivel: 'Ouro' });

      expect(carteira.porFidelidade).toHaveBeenCalledWith({
        escopo: { tipo: 'CARTEIRA', vendedoraCodigoErp: 'SEED-VD01' },
        nivel: 'Ouro',
        mesesSemComprar: undefined,
        deslocamento: undefined,
      });
    });

    it('NÃO tem parâmetro de escopo — a aridade é a garantia', () => {
      // Um objeto de entrada com `nivel`, `mesesSemComprar` e `aPartirDe`, e
      // nada de "de quem": não existe campo para o modelo preencher com o
      // nome de uma colega.
      const ferramenta = montar().clientesPorFidelidade;
      expect(ferramenta.length).toBe(1);
    });

    it('sem código no ERP devolve VAZIO, e nunca a loja', async () => {
      const r = await montar(null).clientesPorFidelidade({});

      // O teste que pega a "simplificação": se alguém fizer o escopo cair
      // para LOJA quando o código é nulo, esta chamada acontece.
      expect(carteira.porFidelidade).not.toHaveBeenCalled();
      expect(r.linhas).toEqual([]);
      expect(r.total).toBe(0);
    });

    it('nível inventado NÃO consulta, e diz que não existe', async () => {
      const r = await montar().clientesPorFidelidade({ nivel: 'Diamante' });

      expect(carteira.porFidelidade).not.toHaveBeenCalled();
      expect(r.nivelDesconhecido).toBe(true);
      expect(r.total).toBe(0);
    });

    it('aceita o nível como ela fala, em minúscula', async () => {
      await montar().clientesPorFidelidade({ nivel: 'ouro' });

      expect(carteira.porFidelidade).toHaveBeenCalledWith(
        expect.objectContaining({ nivel: 'Ouro' }),
      );
    });

    it('repassa "não compra há N meses" e a página seguinte', async () => {
      await montar().clientesPorFidelidade({
        nivel: 'Ouro',
        mesesSemComprar: 6,
        aPartirDe: 20,
      });

      expect(carteira.porFidelidade).toHaveBeenCalledWith(
        expect.objectContaining({ mesesSemComprar: 6, deslocamento: 20 }),
      );
    });

    it('a linha traz nome, compras e valor — e o corte vem em palavras', async () => {
      const r = await montar().clientesPorFidelidade({ nivel: 'Ouro' });

      expect(r.linhas[0]).toContain('Carla Oliveira (Ouro)');
      expect(r.linhas[0]).toContain('9 compras');
      // Sem isto a agente explicaria "Ouro é quem compra muito" ou chutaria
      // um número — e a gestora compararia com o cartão do painel.
      expect(r.cortes).toContain('6 compras ou mais');
    });
  });

  describe('pela Anastasia, no canal da gestão', () => {
    let carteira: { porFidelidade: jest.Mock };
    let resolverVendedora: { execute: jest.Mock };
    let servico: FerramentasGestaoService;

    beforeEach(() => {
      carteira = { porFidelidade: jest.fn().mockResolvedValue(pagina()) };
      resolverVendedora = {
        execute: jest.fn().mockResolvedValue({
          status: 'OK',
          id: 'vd-1',
          nome: 'Marina',
          codigoErp: 'SEED-VD01',
        }),
      };
      servico = new FerramentasGestaoService(
        resolverVendedora as never,
        { execute: jest.fn() } as never,
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
        {
          semComprar: jest.fn(),
          maioresCompradores: jest.fn(),
          porFidelidade: carteira.porFidelidade,
        } as never,
        { execute: jest.fn() } as never,
        { resumo: jest.fn(), listar: jest.fn() } as never,
        { doDia: jest.fn() } as never,
        { execute: jest.fn() } as never,
        { listar: jest.fn(), buscarPorId: jest.fn() } as never,
        { buscarPorNomeParcial: jest.fn() } as never,
        { listarAguardandoGestao: jest.fn() } as never,
        { entre: jest.fn().mockResolvedValue([]) } as never,
      );
    });

    it('SEM nome de vendedora, a pergunta é da LOJA', async () => {
      const r = await servico.montar().gestaoFidelidade({ nivel: 'Ouro' });

      expect(carteira.porFidelidade).toHaveBeenCalledWith({
        escopo: { tipo: 'LOJA' },
        nivel: 'Ouro',
        mesesSemComprar: undefined,
        deslocamento: undefined,
      });
      expect(r.status).toBe('OK');
      expect(r.total).toBe(48);
    });

    it('e os 19 SEM DONA chegam na resposta', async () => {
      const r = await servico.montar().gestaoFidelidade({ nivel: 'Ouro' });

      // Este é o número que impede a gestão de somar as carteiras (29) e
      // achar que viu a loja (48).
      expect(r.semVendedora).toBe(19);
    });

    it('COM nome, recorta na carteira dela — e não na loja', async () => {
      const r = await servico
        .montar()
        .gestaoFidelidade({ nivel: 'Ouro', vendedora: 'Marina' });

      expect(carteira.porFidelidade).toHaveBeenCalledWith(
        expect.objectContaining({
          escopo: { tipo: 'CARTEIRA', vendedoraCodigoErp: 'SEED-VD01' },
        }),
      );
      expect(r.vendedora).toBe('Marina');
      // Na carteira de alguém todo mundo tem dona por definição: avisar
      // "zero sem vendedora" ali seria ruído.
      expect(r.semVendedora).toBe(0);
    });

    it('nome ambíguo pergunta qual, e não consulta nada', async () => {
      resolverVendedora.execute.mockResolvedValue({
        status: 'AMBIGUA',
        nomes: ['Marina Silva', 'Marina Costa'],
      });

      const r = await servico
        .montar()
        .gestaoFidelidade({ vendedora: 'Marina' });

      expect(carteira.porFidelidade).not.toHaveBeenCalled();
      expect(r.status).toBe('AMBIGUA');
      expect(r.nomes).toEqual(['Marina Silva', 'Marina Costa']);
    });

    it('vendedora fora da equipe não é alcançada', async () => {
      // A GERENTE_VENDAS só vê o time dela. `equipe` com outro id tem de
      // barrar antes da consulta.
      const r = await servico
        .montar({ equipe: ['vd-99'] })
        .gestaoFidelidade({ vendedora: 'Marina' });

      expect(carteira.porFidelidade).not.toHaveBeenCalled();
      expect(r.status).toBe('NAO_ENCONTRADA');
    });

    it('vendedora sem código no ERP devolve vazio, e nunca a loja', async () => {
      resolverVendedora.execute.mockResolvedValue({
        status: 'OK',
        id: 'vd-1',
        nome: 'Marina',
        codigoErp: null,
      });

      const r = await servico
        .montar()
        .gestaoFidelidade({ vendedora: 'Marina' });

      expect(carteira.porFidelidade).not.toHaveBeenCalled();
      expect(r.linhas).toEqual([]);
      expect(r.total).toBe(0);
    });

    it('nível inventado não consulta, mesmo com vendedora', async () => {
      const r = await servico
        .montar()
        .gestaoFidelidade({ nivel: 'Diamante', vendedora: 'Marina' });

      expect(resolverVendedora.execute).not.toHaveBeenCalled();
      expect(carteira.porFidelidade).not.toHaveBeenCalled();
      expect(r.nivelDesconhecido).toBe(true);
    });

    it('sem nível, o corte diz que vêm todos — e qual é o de Ouro', async () => {
      const r = await servico.montar().gestaoFidelidade({});

      expect(carteira.porFidelidade).toHaveBeenCalledWith(
        expect.objectContaining({ nivel: undefined }),
      );
      expect(r.cortes).toContain('todos os níveis');
      expect(r.cortes).toContain('6 compras ou mais');
    });
  });
});
