import type { DataSource } from 'typeorm';
import { ConsignacoesDeMovimentacaoRepository } from './consignacoes-de-movimentacao.repository';

/**
 * A CONSIGNAÇÃO LIDA DA MOVIMENTAÇÃO — 19/11/2026.
 *
 * ==========================================================================
 * UMA FONTE, E NÃO DUAS.
 *
 * Copiar a movimentação para a tabela `consignacoes` com um sincronizador
 * criaria dado duplicado — e a próxima divergência, que é o que os dias 17,
 * 18 e 19/11 passaram consertando. Aqui a tela lê a movimentação direto, como
 * as agentes já fazem.
 *
 * A CONTA É POR PEÇA: `saiu − voltou − vendida > 0`. Medida na cópia de
 * produção em 19/11: 146 produtos, 147 peças, R$ 10.217.829,00 — são 147 em
 * 146 porque a PG26071 saiu 17 e voltou 15, e produto não é peça.
 * ==========================================================================
 *
 * O QUE DÁ PARA TESTAR AQUI: o texto da consulta, a numeração dos parâmetros
 * e a tradução da linha crua. A conta em si é SQL e foi conferida contra a
 * cópia — não cabe num mock, e fingir que cabe seria pior que não testar.
 */

/** A linha como o Postgres a devolve: tudo texto, menos as datas. */
function linhaCrua(over: Record<string, unknown> = {}) {
  return {
    id: '0d1b1f54-1111-4444-8888-aaaaaaaaaaaa:7c2e9a30-2222-4444-8888-bbbbbbbbbbbb',
    produto_id: '7c2e9a30-2222-4444-8888-bbbbbbbbbbbb',
    produto_nome: 'BRINCO 58DTS 1.54 CTS OA 18K',
    quantidade: '2',
    destino_tipo: 'CLIENTE',
    cliente_id: 'c1',
    cliente_nome: 'UMA CLIENTE',
    vendedora_id: null,
    vendedora_nome: null,
    status: 'ABERTA',
    data_saida: new Date('2026-11-16T10:00:00Z'),
    data_prevista_retorno: null,
    data_retorno: null,
    observacao: null,
    criado_em: new Date('2026-11-16T10:00:00Z'),
    valor_unitario: '11920',
    total: '146',
    ...over,
  };
}

function montar(resposta: unknown[] = []) {
  const query = jest.fn().mockResolvedValue(resposta);
  const repo = new ConsignacoesDeMovimentacaoRepository({ query } as unknown as DataSource);
  /** O SQL da última chamada, com os espaços normalizados. */
  const sql = (n = 0) => String(query.mock.calls[n][0]).replace(/\s+/g, ' ');
  const params = (n = 0) => query.mock.calls[n][1];
  return { repo, query, sql, params };
}

const SEM_RECORTE = { limit: 10, offset: 0 };

describe('a consignacao lida da movimentacao', () => {
  describe('a linha crua vira ConsignacaoItem', () => {
    it('os numeros que vem como texto viram numero', async () => {
      const { repo } = montar([linhaCrua()]);

      const r = await repo.listar(SEM_RECORTE);

      expect(r.itens[0].quantidade).toBe(2);
      expect(typeof r.itens[0].quantidade).toBe('number');
      expect(r.total).toBe(146);
      expect(typeof r.total).toBe('number');
    });

    it('os nomes resolvidos por JOIN chegam inteiros', async () => {
      const { repo } = montar([linhaCrua()]);

      const r = await repo.listar(SEM_RECORTE);

      expect(r.itens[0]).toMatchObject({
        produtoNome: 'BRINCO 58DTS 1.54 CTS OA 18K',
        clienteNome: 'UMA CLIENTE',
        destinoTipo: 'CLIENTE',
        status: 'ABERTA',
      });
    });

    /**
     * O ERP NÃO REGISTRA PRAZO, e não se inventa um — decisão do Lucas em
     * 19/11: *"não vamos estipular prazo; se não tem, não vamos inventar"*.
     * A coluna fica na tela para o que vier do cadastro manual, e a linha do
     * ERP chega vazia mesmo que um dia a consulta passe a trazer algo ali.
     */
    it('a previsao de retorno e sempre vazia, venha o que vier da consulta', async () => {
      const { repo } = montar([
        linhaCrua({ data_prevista_retorno: new Date('2026-12-01T00:00:00Z') }),
      ]);

      const r = await repo.listar(SEM_RECORTE);

      expect(r.itens[0].dataPrevistaRetorno).toBeNull();
    });

    it('a observacao tambem: o ERP nao tem onde guardar uma', async () => {
      const { repo } = montar([linhaCrua({ observacao: 'veio de algum lugar' })]);

      const r = await repo.listar(SEM_RECORTE);

      expect(r.itens[0].observacao).toBeNull();
    });

    it('lista vazia devolve total zero, e nao NaN', async () => {
      const { repo } = montar([]);

      const r = await repo.listar(SEM_RECORTE);

      expect(r.itens).toEqual([]);
      expect(r.total).toBe(0);
    });
  });

  /**
   * A DISTINÇÃO IDA/VOLTA É A ÚNICA EXCEÇÃO DA CASA À REGRA DA BANDEIRA.
   *
   * Consignação e retorno de consignação têm `saida` E `entrada` ligadas —
   * idênticas. A bandeira não as separa, e só o nome da operação separa. O
   * casamento com o grupo de estoque foi conferido em 6.382 documentos:
   * `ESTOQUES → CONTAS DE…` na ida, o inverso na volta.
   */
  describe('o que distingue a ida da volta', () => {
    it('a consulta separa as duas pontas pelo nome da operacao', async () => {
      const { repo, sql } = montar([]);

      await repo.listar(SEM_RECORTE);

      expect(sql()).toContain("NOT LIKE 'RETORNO%'");
      expect(sql()).toContain("LIKE 'RETORNO%'");
    });

    it('e a bandeira continua sendo o que define que e consignacao', async () => {
      const { repo, sql } = montar([]);

      await repo.listar(SEM_RECORTE);

      // saida E entrada: as duas ligadas. Se um dia alguem trocar isso por
      // `o.nome = 'CONSIGNACAO'`, o teste cai — e tem de cair.
      expect(sql()).toContain('m.saida AND m.entrada');
    });
  });

  describe('o recorte que a tela manda', () => {
    it('sem recorte nenhum, a listagem nao tem WHERE', async () => {
      const { repo, sql, params } = montar([]);

      await repo.listar(SEM_RECORTE);

      expect(sql()).toContain('FROM t ORDER BY');
      expect(params()).toEqual([]);
    });

    it('cada condicao entra com o seu proprio numero, na ordem', async () => {
      const { repo, sql, params } = montar([]);
      const de = new Date('2026-11-01T00:00:00Z');
      const ate = new Date('2026-11-19T23:59:59Z');

      await repo.listar({
        ...SEM_RECORTE,
        status: 'ABERTA',
        destinoTipo: 'CLIENTE',
        dataDe: de,
        dataAte: ate,
      });

      expect(sql()).toContain(
        'WHERE t.status = $1 AND t.destino_tipo = $2 AND t.data_saida >= $3 AND t.data_saida <= $4',
      );
      expect(params()).toEqual(['ABERTA', 'CLIENTE', de, ate]);
    });

    it('so o que veio entra: um filtro sozinho e $1', async () => {
      const { repo, sql, params } = montar([]);

      await repo.listar({ ...SEM_RECORTE, produtoId: 'p1' });

      expect(sql()).toContain('WHERE t.produto_id = $1');
      expect(params()).toEqual(['p1']);
    });

    /**
     * `limit` e `offset` são interpolados no texto, e não parametrizados —
     * então o `Number()` é a única barreira. Texto que não for número vira
     * NaN e o Postgres recusa a consulta, em vez de executá-la.
     */
    it('limit e offset entram como numero, nunca como texto', async () => {
      const { repo, sql } = montar([]);

      await repo.listar({
        limit: '10; DROP TABLE movimentacoes' as unknown as number,
        offset: 20,
      });

      expect(sql()).not.toContain('DROP');
      expect(sql()).toContain('LIMIT NaN OFFSET 20');
    });
  });

  /**
   * OS TRÊS CARTÕES. `abertas` conta LINHAS (uma por produto) e `pecasFora`
   * soma o SALDO — são números diferentes de propósito: 146 produtos e 147
   * peças, porque a PG26071 tem duas fora.
   */
  describe('o resumo', () => {
    it('abertas e pecasFora sao contas diferentes', async () => {
      const { repo, sql } = montar([{ abertas: '146', pecas: '147', valor: '10217829' }]);

      const r = await repo.resumo();

      expect(r).toEqual({ abertas: 146, pecasFora: 147, valorEstimado: 10217829 });
      expect(sql()).toContain('count(*)');
      expect(sql()).toContain('sum(t.quantidade)');
    });

    it('sem recorte, o status e a unica condicao', async () => {
      const { repo, sql } = montar([{ abertas: '146', pecas: '147', valor: '0' }]);

      await repo.resumo();

      expect(sql()).toContain("FROM t WHERE t.status = 'ABERTA'");
    });

    /**
     * A EMENDA DO `AND`. O `where` já vem com o seu próprio `WHERE`, então o
     * status entra como mais uma condição. Trocar isso por um segundo `WHERE`
     * é erro de sintaxe que só aparece em runtime — e já aconteceu nesta casa
     * em 18/11, com um `//` usado como comentário de SQL.
     */
    it('com recorte, o status se emenda com AND e nao com um segundo WHERE', async () => {
      const { repo, sql } = montar([{ abertas: '2', pecas: '2', valor: '0' }]);

      await repo.resumo({ destinoTipo: 'VENDEDORA' });

      expect(sql()).toContain("WHERE t.destino_tipo = $1 AND t.status = 'ABERTA'");
      // Só a cauda: a CTE tem WHEREs próprios, e o que importa é que a
      // consulta de fora tenha UM só.
      const cauda = sql().slice(sql().lastIndexOf('FROM t '));
      expect(cauda.match(/WHERE/g)).toHaveLength(1);
    });

    it('resposta vazia devolve zeros, e nao NaN', async () => {
      const { repo } = montar([]);

      const r = await repo.resumo();

      expect(r).toEqual({ abertas: 0, pecasFora: 0, valorEstimado: 0 });
    });
  });

  /**
   * O ID COMPOSTO — `<movimentacao>:<produto>`. A movimentação não tem id de
   * consignação: ela não guarda a consignação, ela a deriva. O id é estável e
   * rastreável (dá para achar o documento no ERP a partir dele), e os dois
   * lados são uuid, que não tem `:`.
   */
  describe('o detalhe pelo id composto', () => {
    it('busca pela parte do produto, que e a chave da linha', async () => {
      const { repo, params } = montar([linhaCrua()]);

      await repo.buscarItemPorId(
        '0d1b1f54-1111-4444-8888-aaaaaaaaaaaa:7c2e9a30-2222-4444-8888-bbbbbbbbbbbb',
      );

      expect(params()).toEqual(['7c2e9a30-2222-4444-8888-bbbbbbbbbbbb']);
    });

    it('id sem a parte do produto devolve null sem consultar o banco', async () => {
      const { repo, query } = montar([linhaCrua()]);

      const r = await repo.buscarItemPorId('0d1b1f54-1111-4444-8888-aaaaaaaaaaaa');

      expect(r).toBeNull();
      expect(query).not.toHaveBeenCalled();
    });

    it('id que nao acha linha nenhuma devolve null', async () => {
      const { repo } = montar([]);

      const r = await repo.buscarItemPorId('mov-1:prod-1');

      expect(r).toBeNull();
    });
  });
});
