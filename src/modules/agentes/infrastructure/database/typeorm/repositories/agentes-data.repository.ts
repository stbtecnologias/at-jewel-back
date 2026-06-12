import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  AlertaEstoque,
  DemografiaItem,
  GiroLento,
  IAgentesDataRepository,
  KpisVendas,
  ProdutoAnalise,
} from '../../../../domain/ports/repositories/agentes-data-repository.port';

// Expressao de nome legivel do produto, reutilizada nas consultas.
const NOME_PRODUTO = `COALESCE(NULLIF(p.descricao_etiqueta, ''), p.codigo_erp, p.categoria || ' ' || p.familia, LEFT(p.id::text, 8))`;

@Injectable()
export class AgentesDataRepository implements IAgentesDataRepository {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  async kpisVendas(dataInicio?: Date, dataFim?: Date): Promise<KpisVendas> {
    const params: unknown[] = [];
    let filtro = '';
    if (dataInicio && dataFim) {
      params.push(dataInicio, dataFim);
      filtro = 'AND data_venda BETWEEN $1 AND $2';
    }
    const rows = await this.ds.query<{ receitaTotal: number; totalVendas: number }[]>(
      `
      SELECT COALESCE(SUM(valor_total), 0)::float AS "receitaTotal",
             COUNT(*)::int AS "totalVendas"
      FROM vendas
      WHERE status = 'concluida' ${filtro}
      `,
      params,
    );
    return rows[0] ?? { receitaTotal: 0, totalVendas: 0 };
  }

  async demografia(): Promise<DemografiaItem[]> {
    return this.ds.query<DemografiaItem[]>(
      `
      SELECT COALESCE(sexo::text, 'NAO_INFORMADO') AS sexo,
             COALESCE(NULLIF(faixa_etaria, ''), 'Nao informado') AS "faixaEtaria",
             COUNT(*)::int AS total
      FROM clientes_perfil
      GROUP BY COALESCE(sexo::text, 'NAO_INFORMADO'),
               COALESCE(NULLIF(faixa_etaria, ''), 'Nao informado')
      ORDER BY total DESC
      `,
    );
  }

  async alertasEstoque(limite: number): Promise<AlertaEstoque[]> {
    return this.ds.query<AlertaEstoque[]>(
      `
      SELECT p.id AS "produtoId",
             ${NOME_PRODUTO} AS nome,
             p.categoria AS categoria,
             NULLIF(p.referencia_fornecedor, '') AS fornecedor,
             p.estoque_atual AS "estoqueAtual"
      FROM produtos p
      WHERE p.ativo = true AND p.estoque_atual <= 2
      ORDER BY p.estoque_atual ASC
      LIMIT $1
      `,
      [limite],
    );
  }

  async giroLento(diasMin: number, limite: number): Promise<GiroLento[]> {
    return this.ds.query<GiroLento[]>(
      `
      SELECT p.id AS "produtoId",
             ${NOME_PRODUTO} AS nome,
             p.categoria AS categoria,
             p.estoque_atual AS "estoqueAtual",
             EXTRACT(DAY FROM (now() - p.data_entrada_estoque))::int AS "diasEmEstoque"
      FROM produtos p
      WHERE p.ativo = true
        AND p.estoque_atual > 0
        AND p.data_entrada_estoque IS NOT NULL
        AND p.data_entrada_estoque <= now() - ($1::int * interval '1 day')
      ORDER BY p.data_entrada_estoque ASC
      LIMIT $2
      `,
      [diasMin, limite],
    );
  }

  async analisarProduto(produtoId: string): Promise<ProdutoAnalise | null> {
    const base = await this.ds.query<
      {
        produtoId: string;
        nome: string;
        categoria: string;
        tipoPedra: string | null;
        fornecedor: string | null;
        estoqueAtual: number;
        dataEntradaEstoque: Date | null;
      }[]
    >(
      `
      SELECT p.id AS "produtoId",
             ${NOME_PRODUTO} AS nome,
             p.categoria AS categoria,
             NULLIF(p.tipo_pedra, '') AS "tipoPedra",
             NULLIF(p.referencia_fornecedor, '') AS fornecedor,
             p.estoque_atual AS "estoqueAtual",
             p.data_entrada_estoque AS "dataEntradaEstoque"
      FROM produtos p
      WHERE p.id = $1
      `,
      [produtoId],
    );
    if (!base[0]) return null;

    const [ultimasVendas, ocorrencias, totais] = await Promise.all([
      this.ds.query<{ dataVenda: string; valor: number }[]>(
        `
        SELECT to_char(v.data_venda, 'YYYY-MM-DD') AS "dataVenda",
               i.valor_total_item::float AS valor
        FROM itens_venda i
        JOIN vendas v ON v.id = i.venda_id AND v.status = 'concluida'
        WHERE i.produto_id = $1
        ORDER BY v.data_venda DESC
        LIMIT 20
        `,
        [produtoId],
      ),
      this.ds.query<{ tipo: string; descricao: string; data: string }[]>(
        `
        SELECT tipo::text AS tipo, descricao,
               to_char(data, 'YYYY-MM-DD') AS data
        FROM defeitos_devolucoes
        WHERE produto_id = $1
        ORDER BY data DESC
        LIMIT 10
        `,
        [produtoId],
      ),
      this.ds.query<{ totalVendas: number }[]>(
        `
        SELECT COUNT(DISTINCT i.venda_id)::int AS "totalVendas"
        FROM itens_venda i
        JOIN vendas v ON v.id = i.venda_id AND v.status = 'concluida'
        WHERE i.produto_id = $1
        `,
        [produtoId],
      ),
    ]);

    return {
      ...base[0],
      totalVendas: totais[0]?.totalVendas ?? 0,
      ultimasVendas,
      ocorrencias,
    };
  }
}
