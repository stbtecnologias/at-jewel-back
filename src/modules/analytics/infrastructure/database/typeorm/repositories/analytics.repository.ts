import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  ComportamentoData,
  Demografia,
  DistribuicaoOrigem,
  DistribuicaoPagamento,
  EstatisticasInventario,
  FiltroAnalitico,
  GiroFornecedor,
  IAnalyticsRepository,
  JanelaData,
  LinhaVendaCsv,
  ReceitaMensal,
  ReceitaMensalItem,
  ResumoPeriodo,
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

  async comportamentoDatas(
    janelas: JanelaData[],
    filtro?: FiltroAnalitico,
  ): Promise<ComportamentoData[]> {
    // Uma agregacao por janela (poucas datas — custo baixo). Conta vendas
    // concluidas no periodo que antecede cada data comemorativa, ja quebrando
    // por sexo do cliente (RF-CLI-05). Os totais sao a soma das linhas por sexo.
    // O periodo vem da JANELA (data_venda BETWEEN), logo o filtro de
    // data_inicio/data_fim NAO se aplica aqui — so sexo/origem/faixa.
    return Promise.all(
      janelas.map(async (j) => {
        const params: unknown[] = [j.de, j.ate];
        let whereDemo = '';
        if (filtro?.sexo != null) {
          params.push(filtro.sexo);
          whereDemo += ` AND COALESCE(cp.sexo::text, 'NAO_INFORMADO') = $${params.length}`;
        }
        if (filtro?.origem != null) {
          params.push(filtro.origem);
          whereDemo += ` AND COALESCE(cp.origem_contato::text, 'Nao informado') = $${params.length}`;
        }
        if (filtro?.faixaEtaria != null) {
          params.push(filtro.faixaEtaria);
          whereDemo += ` AND COALESCE(NULLIF(cp.faixa_etaria, ''), 'Nao informado') = $${params.length}`;
        }
        const rows = await this.ds.query<
          { sexo: string; totalCompras: number; valorTotal: number }[]
        >(
          `
          SELECT COALESCE(cp.sexo::text, 'NAO_INFORMADO') AS sexo,
                 COUNT(*)::int AS "totalCompras",
                 COALESCE(SUM(v.valor_total), 0)::float AS "valorTotal"
          FROM vendas v
          LEFT JOIN clientes_perfil cp ON cp.cliente_id = v.cliente_id
          WHERE v.status = 'concluida' AND v.data_venda BETWEEN $1 AND $2${whereDemo}
          GROUP BY COALESCE(cp.sexo::text, 'NAO_INFORMADO')
          ORDER BY "totalCompras" DESC
          `,
          params,
        );
        return {
          nome: j.nome,
          de: j.de.toISOString().slice(0, 10),
          ate: j.ate.toISOString().slice(0, 10),
          totalCompras: rows.reduce((s, r) => s + r.totalCompras, 0),
          valorTotal: rows.reduce((s, r) => s + r.valorTotal, 0),
          porSexo: rows.map((r) => ({
            sexo: r.sexo,
            totalCompras: r.totalCompras,
            valorTotal: r.valorTotal,
          })),
        };
      }),
    );
  }

  // Monta o recorte demografico sobre vendas (alias `v`). Retorna o JOIN com
  // clientes_perfil (so quando ha filtro de sexo/origem/faixa — periodo sozinho
  // nao precisa do join) e a clausula WHERE acumulada. Tudo parametrizado ($n).
  private filtroVendas(
    filtro: FiltroAnalitico | undefined,
    params: unknown[],
  ): { join: string; where: string } {
    let where = '';
    if (filtro?.dataInicio && filtro?.dataFim) {
      params.push(filtro.dataInicio, filtro.dataFim);
      where += ` AND v.data_venda BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    const precisaPerfil =
      filtro?.sexo != null || filtro?.origem != null || filtro?.faixaEtaria != null;
    // Compara contra o MESMO rotulo exibido nas distribuicoes (via COALESCE),
    // para que filtrar por "NAO_INFORMADO"/"Nao informado" case as linhas NULL.
    if (filtro?.sexo != null) {
      params.push(filtro.sexo);
      where += ` AND COALESCE(cp.sexo::text, 'NAO_INFORMADO') = $${params.length}`;
    }
    if (filtro?.origem != null) {
      params.push(filtro.origem);
      where += ` AND COALESCE(cp.origem_contato::text, 'Nao informado') = $${params.length}`;
    }
    if (filtro?.faixaEtaria != null) {
      params.push(filtro.faixaEtaria);
      where += ` AND COALESCE(NULLIF(cp.faixa_etaria, ''), 'Nao informado') = $${params.length}`;
    }
    const join = precisaPerfil
      ? ' LEFT JOIN clientes_perfil cp ON cp.cliente_id = v.cliente_id'
      : '';
    return { join, where };
  }

  // Recorte demografico aplicado direto sobre clientes_perfil (alias `cp`).
  // Aqui o "periodo" significa clientes CRIADOS no intervalo (cp.criado_em).
  // Retorna apenas a clausula WHERE acumulada; tudo parametrizado ($n).
  private filtroPerfil(
    filtro: FiltroAnalitico | undefined,
    params: unknown[],
  ): string {
    let where = '';
    if (filtro?.dataInicio && filtro?.dataFim) {
      params.push(filtro.dataInicio, filtro.dataFim);
      where += ` AND cp.criado_em BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    if (filtro?.sexo != null) {
      params.push(filtro.sexo);
      where += ` AND COALESCE(cp.sexo::text, 'NAO_INFORMADO') = $${params.length}`;
    }
    if (filtro?.origem != null) {
      params.push(filtro.origem);
      where += ` AND COALESCE(cp.origem_contato::text, 'Nao informado') = $${params.length}`;
    }
    if (filtro?.faixaEtaria != null) {
      params.push(filtro.faixaEtaria);
      where += ` AND COALESCE(NULLIF(cp.faixa_etaria, ''), 'Nao informado') = $${params.length}`;
    }
    return where;
  }

  async topProdutos(limit: number, filtro?: FiltroAnalitico): Promise<TopProduto[]> {
    const params: unknown[] = [];
    const { join: joinCp, where: whereDemo } = this.filtroVendas(filtro, params);
    params.push(limit);
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
      JOIN vendas v ON v.id = i.venda_id AND v.status = 'concluida'${joinCp}
      LEFT JOIN produtos p ON p.id = i.produto_id
      WHERE i.produto_id IS NOT NULL${whereDemo}
      GROUP BY i.produto_id, p.descricao_etiqueta, p.codigo_erp, p.categoria, p.familia
      ORDER BY "totalVendas" DESC, receita DESC
      LIMIT $${params.length}
      `,
      params,
    );
  }

  async giroEstoquePorFornecedor(filtro?: FiltroAnalitico): Promise<GiroFornecedor[]> {
    const params: unknown[] = [];
    const { join: joinCp, where: whereDemo } = this.filtroVendas(filtro, params);
    return this.ds.query<GiroFornecedor[]>(
      `
      SELECT COALESCE(NULLIF(p.referencia_fornecedor, ''), 'Nao informado') AS fornecedor,
             ROUND(AVG(EXTRACT(EPOCH FROM (v.data_venda - p.data_entrada_estoque)) / 86400))::int AS "tempoMedioEstoque",
             COUNT(*)::int AS "totalVendas"
      FROM itens_venda i
      JOIN vendas v ON v.id = i.venda_id AND v.status = 'concluida'${joinCp}
      JOIN produtos p ON p.id = i.produto_id
      WHERE p.data_entrada_estoque IS NOT NULL
        AND v.data_venda >= p.data_entrada_estoque${whereDemo}
      GROUP BY COALESCE(NULLIF(p.referencia_fornecedor, ''), 'Nao informado')
      ORDER BY "tempoMedioEstoque" ASC
      `,
      params,
    );
  }

  async distribuicaoPagamento(filtro?: FiltroAnalitico): Promise<DistribuicaoPagamento[]> {
    const params: unknown[] = [];
    const { join: joinCp, where: whereDemo } = this.filtroVendas(filtro, params);
    return this.ds.query<DistribuicaoPagamento[]>(
      `
      SELECT pg.forma_pagamento::text AS forma,
             COUNT(*)::int AS total,
             COALESCE(SUM(pg.valor), 0)::float AS valor
      FROM pagamentos_venda pg
      JOIN vendas v ON v.id = pg.venda_id AND v.status = 'concluida'${joinCp}
      WHERE TRUE${whereDemo}
      GROUP BY pg.forma_pagamento
      ORDER BY valor DESC
      `,
      params,
    );
  }

  async resumoPeriodo(filtro?: FiltroAnalitico): Promise<ResumoPeriodo> {
    const params: unknown[] = [];
    const { join: joinCp, where: whereDemo } = this.filtroVendas(filtro, params);
    const rows = await this.ds.query<
      { receita: number; totalVendas: number; ticketMedio: number }[]
    >(
      `
      SELECT COALESCE(SUM(v.valor_total), 0)::float AS receita,
             COUNT(*)::int AS "totalVendas",
             COALESCE(AVG(v.valor_total), 0)::float AS "ticketMedio"
      FROM vendas v${joinCp}
      WHERE v.status = 'concluida'${whereDemo}
      `,
      params,
    );
    return {
      receita: rows[0]?.receita ?? 0,
      totalVendas: rows[0]?.totalVendas ?? 0,
      ticketMedio: rows[0]?.ticketMedio ?? 0,
    };
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

  async distribuicaoOrigem(filtro?: FiltroAnalitico): Promise<DistribuicaoOrigem[]> {
    const params: unknown[] = [];
    const whereDemo = this.filtroPerfil(filtro, params);
    return this.ds.query<DistribuicaoOrigem[]>(
      `
      SELECT COALESCE(cp.origem_contato::text, 'Nao informado') AS origem,
             COUNT(*)::int AS total
      FROM clientes_perfil cp
      WHERE TRUE${whereDemo}
      GROUP BY COALESCE(cp.origem_contato::text, 'Nao informado')
      ORDER BY total DESC
      `,
      params,
    );
  }

  async demografia(filtro?: FiltroAnalitico): Promise<Demografia> {
    const paramsSexo: unknown[] = [];
    const whereSexo = this.filtroPerfil(filtro, paramsSexo);
    const porSexo = await this.ds.query<{ rotulo: string; total: number }[]>(
      `
      SELECT COALESCE(cp.sexo::text, 'NAO_INFORMADO') AS rotulo,
             COUNT(*)::int AS total
      FROM clientes_perfil cp
      WHERE TRUE${whereSexo}
      GROUP BY COALESCE(cp.sexo::text, 'NAO_INFORMADO')
      ORDER BY total DESC
      `,
      paramsSexo,
    );
    const paramsFaixa: unknown[] = [];
    const whereFaixa = this.filtroPerfil(filtro, paramsFaixa);
    const porFaixaEtaria = await this.ds.query<
      { rotulo: string; total: number }[]
    >(
      `
      SELECT COALESCE(NULLIF(cp.faixa_etaria, ''), 'Nao informado') AS rotulo,
             COUNT(*)::int AS total
      FROM clientes_perfil cp
      WHERE TRUE${whereFaixa}
      GROUP BY COALESCE(NULLIF(cp.faixa_etaria, ''), 'Nao informado')
      ORDER BY total DESC
      `,
      paramsFaixa,
    );
    const paramsCruzada: unknown[] = [];
    const whereCruzada = this.filtroPerfil(filtro, paramsCruzada);
    const cruzada = await this.ds.query<
      { faixa: string; sexo: string; total: number }[]
    >(
      `
      SELECT COALESCE(NULLIF(cp.faixa_etaria, ''), 'Nao informado') AS faixa,
             COALESCE(cp.sexo::text, 'NAO_INFORMADO') AS sexo,
             COUNT(*)::int AS total
      FROM clientes_perfil cp
      WHERE TRUE${whereCruzada}
      GROUP BY faixa, sexo
      ORDER BY faixa, sexo
      `,
      paramsCruzada,
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
