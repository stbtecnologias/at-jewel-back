import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ehConsignacao,
  ehVenda,
} from '../../../../../../shared/database/sql/movimentacao-como-venda';
import type {
  ConsignacaoItem,
  FiltroConsignacao,
  ListaConsignacoes,
  ResumoConsignacoes,
} from '../../../../domain/ports/repositories/consignacao-repository.port';

/**
 * A CONSIGNAÇÃO QUE JÁ EXISTE, LIDA DA MOVIMENTAÇÃO — 19/11/2026.
 *
 * ==========================================================================
 * A TELA NASCEU EM 09/11 E NUNCA TEVE UMA LINHA.
 *
 * A tabela `consignacoes` é cadastro manual, e ninguém cadastra — o ERP já
 * registra. Enquanto a tela mostrava "Nenhuma consignação", a mesma base
 * tinha 2.822 consignações, 3.560 retornos e 147 peças fora, R$ 10,2 milhões.
 *
 * UMA FONTE, E NÃO DUAS. Copiar a movimentação para a tabela com um
 * sincronizador criaria dado duplicado — e a próxima divergência, que é o que
 * os dias 17, 18 e 19/11 passaram consertando. Aqui a tela lê a movimentação
 * direto, como as agentes já fazem.
 * ==========================================================================
 *
 * A CONTA É POR PEÇA, e é a mesma da ferramenta `consignacoes`:
 *
 *   saiu − voltou − vendida > 0  →  ainda está com alguém
 *
 * E A IDA SE DISTINGUE DA VOLTA PELO NOME DA OPERAÇÃO, que é a ÚNICA exceção
 * da casa à regra da bandeira: as duas pontas têm `saida` e `entrada`
 * ligadas, então a bandeira não as separa. O casamento com o grupo de estoque
 * foi conferido em 6.382 documentos — `ESTOQUES → CONTAS DE…` na ida, o
 * inverso na volta.
 */
@Injectable()
export class ConsignacoesDeMovimentacaoRepository {
  constructor(private readonly ds: DataSource) {}

  /**
   * O NOME DA OPERAÇÃO NA FRASE, E NÃO UM BOOLEANO: quem ler a consulta vê
   * por que o `RETORNO%` está aqui, em vez de procurar no histórico.
   */
  private static readonly IDA = `${ehConsignacao('m')} AND upper(COALESCE(o.nome, '')) NOT LIKE 'RETORNO%'`;
  private static readonly VOLTA = `${ehConsignacao('m')} AND upper(COALESCE(o.nome, '')) LIKE 'RETORNO%'`;

  /**
   * A peça, com a última ida como cabeça da linha.
   *
   * `id` NÃO EXISTE NA MOVIMENTAÇÃO, então é composto: `<movimentacao>:<produto>`.
   * É estável e rastreável — dá para achar o documento no ERP a partir dele —
   * e o `:` separa sem ambiguidade, porque os dois lados são uuid.
   */
  private static readonly POR_PECA = `
    WITH consig AS (
      SELECT i.produto_id,
             m.id            AS movimentacao_id,
             m.data_movimentacao,
             m.cliente_id,
             m.vendedora_id,
             i.quantidade,
             i.valor_unitario,
             (${ConsignacoesDeMovimentacaoRepository.IDA})   AS ida,
             (${ConsignacoesDeMovimentacaoRepository.VOLTA}) AS volta,
             (${ehVenda('m')})                               AS venda
        FROM movimentacoes m
        JOIN movimentacoes_itens i ON i.movimentacao_id = m.id AND i.ativo
        LEFT JOIN operacoes o ON o.id = m.operacao_id
       WHERE m.ativo AND i.produto_id IS NOT NULL
    ), por_peca AS (
      SELECT produto_id,
             COALESCE(sum(quantidade) FILTER (WHERE ida), 0)   AS saiu,
             COALESCE(sum(quantidade) FILTER (WHERE volta), 0) AS voltou,
             COALESCE(sum(quantidade) FILTER (WHERE venda), 0) AS vendida,
             max(data_movimentacao) FILTER (WHERE ida)         AS data_saida,
             max(data_movimentacao) FILTER (WHERE volta)       AS data_volta,
             max(data_movimentacao) FILTER (WHERE venda)       AS data_venda,
             (array_agg(movimentacao_id ORDER BY data_movimentacao DESC)
                FILTER (WHERE ida))[1]                         AS movimentacao_id,
             (array_agg(cliente_id ORDER BY data_movimentacao DESC)
                FILTER (WHERE ida))[1]                         AS cliente_id,
             (array_agg(vendedora_id ORDER BY data_movimentacao DESC)
                FILTER (WHERE ida))[1]                         AS vendedora_id,
             (array_agg(valor_unitario ORDER BY data_movimentacao DESC)
                FILTER (WHERE ida))[1]                         AS valor_unitario
        FROM consig
       GROUP BY produto_id
      HAVING COALESCE(sum(quantidade) FILTER (WHERE ida), 0) > 0
    ), classificada AS (
      SELECT pp.*,
             (pp.saiu - pp.voltou - pp.vendida) AS saldo,
             CASE
               WHEN pp.saiu - pp.voltou - pp.vendida > 0 THEN 'ABERTA'
               -- FECHOU: quem fechou foi a última coisa que aconteceu.
               WHEN COALESCE(pp.data_venda, '-infinity'::timestamptz)
                  > COALESCE(pp.data_volta, '-infinity'::timestamptz) THEN 'VENDIDA'
               ELSE 'DEVOLVIDA'
             END AS status
        FROM por_peca pp
    )
    SELECT c.movimentacao_id::text || ':' || c.produto_id::text AS id,
           c.produto_id,
           COALESCE(
             NULLIF(p.descricao_etiqueta, ''),
             p.codigo_erp,
             p.categoria || ' ' || p.familia,
             LEFT(c.produto_id::text, 8)
           ) AS produto_nome,
           -- A QUANTIDADE DA LINHA É O QUE AINDA ESTÁ FORA quando aberta; nas
           -- fechadas, o que saiu. Peça com saldo 2 (a PG26071 saiu 17 e
           -- voltou 15) conta 2, e não 1 — produto não é peça.
           CASE WHEN c.status = 'ABERTA' THEN c.saldo ELSE c.saiu END AS quantidade,
           CASE WHEN c.cliente_id IS NOT NULL THEN 'CLIENTE' ELSE 'VENDEDORA' END AS destino_tipo,
           c.cliente_id,
           cl.nome AS cliente_nome,
           c.vendedora_id,
           vd.nome AS vendedora_nome,
           c.status,
           c.data_saida,
           -- O ERP NÃO REGISTRA PRAZO, e não se inventa um: decisão do Lucas
           -- em 19/11. A tela mostra há quanto tempo a peça está fora, e quem
           -- olha julga.
           NULL::timestamptz AS data_prevista_retorno,
           CASE WHEN c.status = 'ABERTA' THEN NULL
                WHEN c.status = 'VENDIDA' THEN c.data_venda
                ELSE c.data_volta END AS data_retorno,
           NULL::text AS observacao,
           c.data_saida AS criado_em,
           c.valor_unitario
      FROM classificada c
      LEFT JOIN produtos p ON p.id = c.produto_id
      LEFT JOIN clientes cl ON cl.id = c.cliente_id
      LEFT JOIN vendedoras vd ON vd.id = c.vendedora_id`;

  /** As condições que a tela manda, aplicadas sobre a linha já montada. */
  private filtro(
    f: Omit<FiltroConsignacao, 'limit' | 'offset'>,
    params: unknown[],
  ): string {
    const conds: string[] = [];
    if (f.status) {
      params.push(f.status);
      conds.push(`t.status = $${params.length}`);
    }
    if (f.destinoTipo) {
      params.push(f.destinoTipo);
      conds.push(`t.destino_tipo = $${params.length}`);
    }
    if (f.produtoId) {
      params.push(f.produtoId);
      conds.push(`t.produto_id = $${params.length}`);
    }
    if (f.dataDe) {
      params.push(f.dataDe);
      conds.push(`t.data_saida >= $${params.length}`);
    }
    if (f.dataAte) {
      params.push(f.dataAte);
      conds.push(`t.data_saida <= $${params.length}`);
    }
    return conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  }

  async listar(filtro: FiltroConsignacao): Promise<ListaConsignacoes> {
    const params: unknown[] = [];
    const where = this.filtro(filtro, params);

    const linhas = await this.ds.query<LinhaDaPeca[]>(
      `WITH t AS (${ConsignacoesDeMovimentacaoRepository.POR_PECA})
       SELECT t.*, count(*) OVER () AS total
         FROM t ${where}
        ORDER BY t.data_saida DESC
        LIMIT ${Number(filtro.limit)} OFFSET ${Number(filtro.offset)}`,
      params,
    );

    return {
      itens: linhas.map(paraItem),
      total: Number(linhas[0]?.total ?? 0),
    };
  }

  async buscarItemPorId(id: string): Promise<ConsignacaoItem | null> {
    // O id composto é a chave: só a parte do produto basta para achar a linha,
    // porque há uma por produto.
    const produtoId = id.split(':')[1];
    if (!produtoId) return null;

    const linhas = await this.ds.query<LinhaDaPeca[]>(
      `WITH t AS (${ConsignacoesDeMovimentacaoRepository.POR_PECA})
       SELECT t.* FROM t WHERE t.produto_id = $1 LIMIT 1`,
      [produtoId],
    );
    return linhas[0] ? paraItem(linhas[0]) : null;
  }

  /**
   * OS TRÊS CARTÕES. `abertas` conta LINHAS (uma por produto) e `pecasFora`
   * soma o SALDO — são números diferentes de propósito: 147 peças em 146
   * produtos, porque a PG26071 tem duas fora.
   */
  async resumo(
    filtro: Omit<FiltroConsignacao, 'limit' | 'offset'> = {},
  ): Promise<ResumoConsignacoes> {
    const params: unknown[] = [];
    const where = this.filtro(filtro, params);
    const e = where ? `${where} AND` : 'WHERE';

    const [linha] = await this.ds.query<
      { abertas: string; pecas: string; valor: string }[]
    >(
      `WITH t AS (${ConsignacoesDeMovimentacaoRepository.POR_PECA})
       SELECT count(*)                                   AS abertas,
              COALESCE(sum(t.quantidade), 0)             AS pecas,
              COALESCE(sum(t.quantidade * t.valor_unitario), 0) AS valor
         FROM t ${e} t.status = 'ABERTA'`,
      params,
    );

    return {
      abertas: Number(linha?.abertas ?? 0),
      pecasFora: Number(linha?.pecas ?? 0),
      valorEstimado: Number(linha?.valor ?? 0),
    };
  }
}

interface LinhaDaPeca {
  id: string;
  produto_id: string;
  produto_nome: string | null;
  quantidade: string;
  destino_tipo: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  vendedora_id: string | null;
  vendedora_nome: string | null;
  status: string;
  data_saida: Date;
  data_prevista_retorno: Date | null;
  data_retorno: Date | null;
  observacao: string | null;
  criado_em: Date;
  valor_unitario: string;
  total?: string;
}

function paraItem(l: LinhaDaPeca): ConsignacaoItem {
  return {
    id: l.id,
    produtoId: l.produto_id,
    produtoNome: l.produto_nome,
    quantidade: Number(l.quantidade),
    destinoTipo: l.destino_tipo as ConsignacaoItem['destinoTipo'],
    clienteId: l.cliente_id,
    clienteNome: l.cliente_nome,
    vendedoraId: l.vendedora_id,
    vendedoraNome: l.vendedora_nome,
    status: l.status as ConsignacaoItem['status'],
    dataSaida: l.data_saida,
    dataPrevistaRetorno: null,
    dataRetorno: l.data_retorno,
    observacao: null,
    createdAt: l.criado_em,
  };
}
