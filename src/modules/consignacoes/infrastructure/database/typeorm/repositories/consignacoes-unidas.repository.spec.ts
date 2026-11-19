import { ConsignacoesUnidasRepository } from './consignacoes-unidas.repository';
import type { ConsignacaoRepository } from './consignacao.repository';
import type { ConsignacoesDeMovimentacaoRepository } from './consignacoes-de-movimentacao.repository';
import type {
  ConsignacaoItem,
  ListaConsignacoes,
} from '../../../../domain/ports/repositories/consignacao-repository.port';

/**
 * AS DUAS FONTES NUMA LISTA SÓ — 19/11/2026.
 *
 * ==========================================================================
 * O QUE ESTES TESTES PROTEGEM.
 *
 * A tela de Consignações nasceu em 09/11 e passou dez dias vazia: a tabela
 * `consignacoes` é cadastro manual e ninguém cadastra, enquanto a mesma base
 * já tinha 5.807 peças consignadas no histórico e 147 fora hoje.
 *
 * Em 19/11 a tela passou a ler a movimentação. O botão "Nova consignação"
 * ficou — decisão do Lucas: *"deixa o botão aí, depois vemos"* — e por isso
 * a leitura tem de unir as duas fontes. Sem a união, o que alguém cadastrasse
 * não apareceria na lista e o botão viraria um buraco silencioso.
 * ==========================================================================
 */

/** Qualquer método não previsto no teste estoura, em vez de devolver undefined. */
function naoParaTudo<T>(nome: string, previstos: Partial<T>): T {
  return new Proxy(previstos as object, {
    get(alvo, prop) {
      if (prop in alvo) return (alvo as Record<string | symbol, unknown>)[prop];
      return () => {
        throw new Error(`${nome}.${String(prop)} nao deveria ser chamado`);
      };
    },
  }) as T;
}

function item(id: string, dataSaida: string): ConsignacaoItem {
  return {
    id,
    produtoId: id,
    produtoNome: `PRODUTO ${id}`,
    quantidade: 1,
    destinoTipo: 'CLIENTE',
    clienteId: null,
    clienteNome: null,
    vendedoraId: null,
    vendedoraNome: null,
    status: 'ABERTA',
    dataSaida: new Date(dataSaida),
    dataPrevistaRetorno: null,
    dataRetorno: null,
    observacao: null,
    createdAt: new Date(dataSaida),
  } as ConsignacaoItem;
}

function montar(
  doErp: Partial<ConsignacoesDeMovimentacaoRepository>,
  daTabela: Partial<ConsignacaoRepository>,
) {
  const erp = naoParaTudo<ConsignacoesDeMovimentacaoRepository>('erp', doErp);
  const tabela = naoParaTudo<ConsignacaoRepository>('tabela', daTabela);
  return new ConsignacoesUnidasRepository(tabela, erp);
}

const FILTRO = { limit: 10, offset: 0 };

describe('as duas fontes de consignacao numa lista so', () => {
  describe('listar', () => {
    it('junta as duas e ordena por data de saida, da mais nova para a mais velha', async () => {
      const unidas = montar(
        {
          listar: jest.fn().mockResolvedValue({
            itens: [item('erp-16/11', '2026-11-16'), item('erp-02/11', '2026-11-02')],
            total: 2,
          } as ListaConsignacoes),
        },
        {
          listar: jest.fn().mockResolvedValue({
            itens: [item('tabela-10/11', '2026-11-10')],
            total: 1,
          } as ListaConsignacoes),
        },
      );

      const r = await unidas.listar(FILTRO);

      expect(r.itens.map((i) => i.id)).toEqual([
        'erp-16/11',
        'tabela-10/11',
        'erp-02/11',
      ]);
    });

    it('o total e a soma dos dois totais', async () => {
      const unidas = montar(
        { listar: jest.fn().mockResolvedValue({ itens: [], total: 146 }) },
        { listar: jest.fn().mockResolvedValue({ itens: [], total: 3 }) },
      );

      const r = await unidas.listar(FILTRO);

      expect(r.total).toBe(149);
    });

    /**
     * ESTE É O TESTE QUE JUSTIFICA O `TETO`.
     *
     * Paginar cada fonte por separado devolveria as duas primeiras de CADA
     * uma — quatro linhas, e a ordem global perdida. A página tem de sair do
     * conjunto já unido e já ordenado.
     */
    it('a pagina sai do conjunto unido, e nao de cada fonte por separado', async () => {
      const unidas = montar(
        {
          listar: jest.fn().mockResolvedValue({
            itens: [item('erp-17/11', '2026-11-17'), item('erp-15/11', '2026-11-15')],
            total: 2,
          }),
        },
        {
          listar: jest.fn().mockResolvedValue({
            itens: [item('tabela-16/11', '2026-11-16'), item('tabela-14/11', '2026-11-14')],
            total: 2,
          }),
        },
      );

      const r = await unidas.listar({ limit: 2, offset: 0 });

      // As duas mais novas do conjunto, uma de cada fonte.
      expect(r.itens.map((i) => i.id)).toEqual(['erp-17/11', 'tabela-16/11']);
      expect(r.itens).toHaveLength(2);
    });

    it('o offset tambem corre sobre o conjunto unido', async () => {
      const unidas = montar(
        {
          listar: jest.fn().mockResolvedValue({
            itens: [item('erp-17/11', '2026-11-17'), item('erp-15/11', '2026-11-15')],
            total: 2,
          }),
        },
        {
          listar: jest.fn().mockResolvedValue({
            itens: [item('tabela-16/11', '2026-11-16'), item('tabela-14/11', '2026-11-14')],
            total: 2,
          }),
        },
      );

      const r = await unidas.listar({ limit: 2, offset: 2 });

      expect(r.itens.map((i) => i.id)).toEqual(['erp-15/11', 'tabela-14/11']);
    });

    /**
     * Cada fonte é lida INTEIRA antes de unir: o `limit` da tela não pode
     * descer para elas, ou a ordenação global já nasce cortada.
     */
    it('le as duas inteiras, sem repassar o limit e o offset da tela', async () => {
      const doErp = jest.fn().mockResolvedValue({ itens: [], total: 0 });
      const daTabela = jest.fn().mockResolvedValue({ itens: [], total: 0 });
      const unidas = montar({ listar: doErp }, { listar: daTabela });

      await unidas.listar({ limit: 10, offset: 40, status: 'ABERTA' });

      for (const fonte of [doErp, daTabela]) {
        const pedido = fonte.mock.calls[0][0];
        expect(pedido.offset).toBe(0);
        expect(pedido.limit).toBeGreaterThanOrEqual(5000);
        // E o resto do filtro passa intacto.
        expect(pedido.status).toBe('ABERTA');
      }
    });

    it('a tabela vazia nao atrapalha: a lista e a do ERP', async () => {
      const unidas = montar(
        {
          listar: jest.fn().mockResolvedValue({
            itens: [item('erp-16/11', '2026-11-16')],
            total: 1,
          }),
        },
        { listar: jest.fn().mockResolvedValue({ itens: [], total: 0 }) },
      );

      const r = await unidas.listar(FILTRO);

      expect(r.itens.map((i) => i.id)).toEqual(['erp-16/11']);
      expect(r.total).toBe(1);
    });
  });

  describe('resumo', () => {
    it('soma os tres numeros das duas fontes', async () => {
      const unidas = montar(
        {
          resumo: jest.fn().mockResolvedValue({
            abertas: 146,
            pecasFora: 147,
            valorEstimado: 10217829,
          }),
        },
        {
          resumo: jest.fn().mockResolvedValue({
            abertas: 2,
            pecasFora: 5,
            valorEstimado: 1000,
          }),
        },
      );

      const r = await unidas.resumo();

      expect(r).toEqual({
        abertas: 148,
        pecasFora: 152,
        valorEstimado: 10218829,
      });
    });

    it('repassa o recorte para as duas fontes', async () => {
      const doErp = jest.fn().mockResolvedValue({ abertas: 0, pecasFora: 0, valorEstimado: 0 });
      const daTabela = jest.fn().mockResolvedValue({ abertas: 0, pecasFora: 0, valorEstimado: 0 });
      const unidas = montar({ resumo: doErp }, { resumo: daTabela });

      const recorte = { destinoTipo: 'VENDEDORA' as const };
      await unidas.resumo(recorte);

      expect(doErp).toHaveBeenCalledWith(recorte);
      expect(daTabela).toHaveBeenCalledWith(recorte);
    });
  });

  /**
   * O ROTEAMENTO PELO `:`.
   *
   * A movimentação não tem id de consignação — ela não guarda a consignação,
   * ela a deriva. O id da linha do ERP é composto, `<movimentacao>:<produto>`,
   * e os dois lados são uuid, que não tem `:`. Logo o separador basta para
   * dizer de onde a linha veio.
   */
  describe('de onde veio a linha', () => {
    it('id composto vai para o ERP', async () => {
      const doErp = jest.fn().mockResolvedValue(item('x', '2026-11-16'));
      const unidas = montar({ buscarItemPorId: doErp }, {});

      await unidas.buscarItemPorId(
        '0d1b1f54-1111-4444-8888-aaaaaaaaaaaa:7c2e9a30-2222-4444-8888-bbbbbbbbbbbb',
      );

      expect(doErp).toHaveBeenCalled();
    });

    it('uuid simples vai para a tabela', async () => {
      const daTabela = jest.fn().mockResolvedValue(null);
      const unidas = montar({}, { buscarItemPorId: daTabela });

      await unidas.buscarItemPorId('0d1b1f54-1111-4444-8888-aaaaaaaaaaaa');

      expect(daTabela).toHaveBeenCalled();
    });
  });

  /**
   * A ESCRITA VAI SÓ PARA A TABELA, e isso não é arbitrário: não há o que
   * criar nem o que atualizar numa movimentação do ERP.
   */
  describe('a escrita', () => {
    it('a entidade de dominio de uma linha do ERP e null, sem tocar a tabela', async () => {
      const daTabela = jest.fn();
      const unidas = montar({}, { buscarPorId: daTabela });

      const r = await unidas.buscarPorId(
        '0d1b1f54-1111-4444-8888-aaaaaaaaaaaa:7c2e9a30-2222-4444-8888-bbbbbbbbbbbb',
      );

      // Null, e nao uma consulta que nao acharia nada: a linha do ERP e
      // derivada, nao guardada. Quem pedir recebe "nao encontrada", que e a
      // verdade — e o caso de uso responde 404 em vez de fingir que gravou.
      expect(r).toBeNull();
      expect(daTabela).not.toHaveBeenCalled();
    });

    it('criar grava na tabela', async () => {
      const criar = jest.fn().mockResolvedValue({ id: 'nova' });
      const unidas = montar({}, { criar });

      await unidas.criar({ id: 'nova' } as never);

      expect(criar).toHaveBeenCalled();
    });

    it('atualizar grava na tabela', async () => {
      const atualizar = jest.fn().mockResolvedValue(item('x', '2026-11-16'));
      const unidas = montar({}, { atualizar });

      await unidas.atualizar('0d1b1f54-1111-4444-8888-aaaaaaaaaaaa', {
        status: 'DEVOLVIDA',
      });

      expect(atualizar).toHaveBeenCalledWith('0d1b1f54-1111-4444-8888-aaaaaaaaaaaa', {
        status: 'DEVOLVIDA',
      });
    });
  });
});
