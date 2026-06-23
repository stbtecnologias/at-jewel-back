import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  ComportamentoData,
  Demografia,
  DistribuicaoOrigem,
  DistribuicaoPagamento,
  EstatisticasInventario,
  GiroFornecedor,
  IAnalyticsRepository,
  JanelaData,
  LinhaVendaCsv,
  ReceitaMensal,
  ReceitaMensalItem,
  TopProduto,
} from '../../../../domain/ports/repositories/analytics-repository.port';

// Reimplementacao da feature "analytics" do backend paralelo (atp) contra o
// NOSSO modelo normalizado: venda -> itens_venda -> pagamentos_venda. Apenas
// leitura/agregacao via SQL parametrizado.
@Injectable()
export class AnalyticsRepository implements IAnalyticsRepository {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  async receitaMensal(meses: number): Promise<ReceitaMensal> {
    // Esqueleto de N meses via generate_series garante meses zerados na serie.
    const linhas = await this.ds.query<ReceitaMensalItem[]>(
      `
      WITH serie AS (
        SELECT to_char(m, 'YYYY-MM') AS mes, m AS inicio
        FROM generate_series(
          date_trunc('month', now()) - (($1::int - 1) * interval '1 month'),
          date_trunc('month', now()),
          interval '1 month'
        ) AS m
      )
      SELECT serie.mes AS mes,
             COALESCE(SUM(v.valor_total), 0)::float AS receita,
             COUNT(v.id)::int AS "totalVendas"
      FROM serie
      LEFT JOIN vendas v
        ON date_trunc('month', v.data_venda) = serie.inicio
       AND v.status = 'concluida'
      GROUP BY serie.mes, serie.inicio
      ORDER BY serie.inicio
      `,
      [meses],
    );

    const metaRows = await this.ds.query<{ meta: number }[]>(
      `
      SELECT COALESCE(valor_alvo, 0)::float AS meta
      FROM metas
      WHERE tipo = 'GLOBAL' AND prazo >= now()
      ORDER BY criado_em DESC
      LIMIT 1
      `,
    );

    return { meses: linhas, meta: metaRows[0]?.meta ?? 0 };
  }

  async comportamentoDatas(janelas: JanelaData[]): Promise<ComportamentoData[]> {
    // Uma agregacao por janela (poucas datas — custo baixo). Conta vendas
    // concluidas no periodo que antecede cada data comemorativa.
    return Promise.all(
      janelas.map(async (j) => {
        const rows = await this.ds.query<
          { totalCompras: number; valorTotal: number }[]
        >(
          `
          SELECT COUNT(*)::int AS "totalCompras",
                 COALESCE(SUM(valor_total), 0)::float AS "valorTotal"
          FROM vendas
          WHERE status = 'concluida' AND data_venda BETWEEN $1 AND $2
          `,
          [j.de, j.ate],
        );
        return {
          nome: j.nome,
          de: j.de.toISOString().slice(0, 10),
          ate: j.ate.toISOString().slice(0, 10),
          totalCompras: rows[0]?.totalCompras ?? 0,
          valorTotal: rows[0]?.valorTotal ?? 0,
        };
      }),
    );
  }

  async topProdutos(limit: number): Promise<TopProduto[]> {
    return this.ds.query<TopProduto[]>(
      `
      SELECT i.produto_id AS "produtoId",
             COALESCE(
               NULLIF(p.descricao_etiqueta, ''),
               p.codigo_erp,
               p.categoria || ' ' || p.familia,
               LEFT(i.produto_id::text, 8)
             ) AS nome,
             COUNT(DISTINCT i.venda_id)::int AS "totalVendas",
             COALESCE(SUM(i.valor_total_item), 0)::float AS receita,
             COALESCE(SUM(i.quantidade), 0)::float AS quantidade
      FROM itens_venda i
      JOIN vendas v ON v.id = i.venda_id AND v.status = 'concluida'
      LEFT JOIN produtos p ON p.id = i.produto_id
      WHERE i.produto_id IS NOT NULL
      GROUP BY i.produto_id, p.descricao_etiqueta, p.codigo_erp, p.categoria, p.familia
      ORDER BY "totalVendas" DESC, receita DESC
      LIMIT $1
      `,
      [limit],
    );
  }

  async giroEstoquePorFornecedor(): Promise<GiroFornecedor[]> {
    return this.ds.query<GiroFornecedor[]>(
      `
      SELECT COALESCE(NULLIF(p.referencia_fornecedor, ''), 'Nao informado') AS fornecedor,
             ROUND(AVG(EXTRACT(EPOCH FROM (v.data_venda - p.data_entrada_estoque)) / 86400))::int AS "tempoMedioEstoque",
             COUNT(*)::int AS "totalVendas"
      FROM itens_venda i
      JOIN vendas v ON v.id = i.venda_id AND v.status = 'concluida'
      JOIN produtos p ON p.id = i.produto_id
      WHERE p.data_entrada_estoque IS NOT NULL
        AND v.data_venda >= p.data_entrada_estoque
      GROUP BY COALESCE(NULLIF(p.referencia_fornecedor, ''), 'Nao informado')
      ORDER BY "tempoMedioEstoque" ASC
      `,
    );
  }

  async distribuicaoPagamento(): Promise<DistribuicaoPagamento[]> {
    return this.ds.query<DistribuicaoPagamento[]>(
      `
      SELECT pg.forma_pagamento::text AS forma,
             COUNT(*)::int AS total,
             COALESCE(SUM(pg.valor), 0)::float AS valor
      FROM pagamentos_venda pg
      JOIN vendas v ON v.id = pg.venda_id AND v.status = 'concluida'
      GROUP BY pg.forma_pagamento
      ORDER BY valor DESC
      `,
    );
  }

  async estatisticasInventario(): Promise<EstatisticasInventario> {
    const porCategoria = await this.ds.query<
      EstatisticasInventario['porCategoria']
    >(
      `
      SELECT categoria AS categoria,
             COUNT(*)::int AS quantidade,
             COALESCE(SUM(estoque_atual), 0)::int AS "totalEstoque"
      FROM produtos
      WHERE ativo = true
      GROUP BY categoria
      ORDER BY quantidade DESC
      `,
    );

    const totais = await this.ds.query<{ total: number; valorTotal: number }[]>(
      `
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM(valor_venda * estoque_atual), 0)::float AS "valorTotal"
      FROM produtos
      WHERE ativo = true
      `,
    );

    return {
      total: totais[0]?.total ?? 0,
      valorTotal: totais[0]?.valorTotal ?? 0,
      porCategoria,
    };
  }

  async distribuicaoOrigem(): Promise<DistribuicaoOrigem[]> {
    return this.ds.query<DistribuicaoOrigem[]>(
      `
      SELECT COALESCE(origem_contato::text, 'Nao informado') AS origem,
             COUNT(*)::int AS total
      FROM clientes_perfil
      GROUP BY COALESCE(origem_contato::text, 'Nao informado')
      ORDER BY total DESC
      `,
    );
  }

  async demografia(): Promise<Demografia> {
    const porSexo = await this.ds.query<{ rotulo: string; total: number }[]>(
      `
      SELECT COALESCE(sexo::text, 'NAO_INFORMADO') AS rotulo,
             COUNT(*)::int AS total
      FROM clientes_perfil
      GROUP BY COALESCE(sexo::text, 'NAO_INFORMADO')
      ORDER BY total DESC
      `,
    );
    const porFaixaEtaria = await this.ds.query<
      { rotulo: string; total: number }[]
    >(
      `
      SELECT COALESCE(NULLIF(faixa_etaria, ''), 'Nao informado') AS rotulo,
             COUNT(*)::int AS total
      FROM clientes_perfil
      GROUP BY COALESCE(NULLIF(faixa_etaria, ''), 'Nao informado')
      ORDER BY total DESC
      `,
    );
    const cruzada = await this.ds.query<
      { faixa: string; sexo: string; total: number }[]
    >(
      `
      SELECT COALESCE(NULLIF(faixa_etaria, ''), 'Nao informado') AS faixa,
             COALESCE(sexo::text, 'NAO_INFORMADO') AS sexo,
             COUNT(*)::int AS total
      FROM clientes_perfil
      GROUP BY faixa, sexo
      ORDER BY faixa, sexo
      `,
    );
    return { porSexo, porFaixaEtaria, cruzada };
  }

  async linhasVendaCsv(dataInicio?: Date, dataFim?: Date): Promise<LinhaVendaCsv[]> {
    const params: unknown[] = [];
    let filtro = '';
    if (dataInicio && dataFim) {
      params.push(dataInicio, dataFim);
      filtro = 'WHERE v.data_venda BETWEEN $1 AND $2';
    }
    return this.ds.query<LinhaVendaCsv[]>(
      `
      SELECT v.id AS id,
             to_char(v.data_venda, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS "dataVenda",
             v.cliente_id AS "clienteId",
             v.vendedora_id AS "vendedoraId",
             v.valor_total::float AS "valorTotal",
             v.status::text AS status,
             COALESCE(string_agg(DISTINCT pg.forma_pagamento::text, '|'), '') AS "formasPagamento"
      FROM vendas v
      LEFT JOIN pagamentos_venda pg ON pg.venda_id = v.id
      ${filtro}
      GROUP BY v.id, v.data_venda, v.cliente_id, v.vendedora_id, v.valor_total, v.status
      ORDER BY v.data_venda DESC
      `,
      params,
    );
  }
}
