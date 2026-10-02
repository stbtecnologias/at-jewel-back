import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  EMPRESAS_COM_MOVIMENTO,
  STATUS_DE_MOVIMENTACAO,
  formaPagamentoDe,
  receitaLiquida,
  valorAssinado,
  vendaEfetiva,
} from '../../../../../../shared/database/sql/movimentacao-como-venda';
import { FUSO_DA_LOJA } from '../../../../../../shared/erp/data-do-erp';
import type {
  ComportamentoData,
  Demografia,
  DistribuicaoOrigem,
  DistribuicaoPagamento,
  EstatisticasInventario,
  FiltroAnalitico,
  GiroFamilia,
  GiroFornecedor,
  IAnalyticsRepository,
  JanelaData,
  LinhaVendaCsv,
  ReceitaMensal,
  ReceitaMensalItem,
  ResumoPeriodo,
  TopProduto,
} from '../../../../domain/ports/repositories/analytics-repository.port';
import { AnalyticsRepository } from './analytics.repository';

/**
 * O ANALYTICS LENDO A MOVIMENTACAO — 01/10/2026.
 *
 * ==========================================================================
 * O DADO CHEGOU, E A TELA OLHAVA PARA O LUGAR ERRADO.
 *
 * Em 25/09 a tela de Vendas passou a ler `movimentacoes`. O Analytics ficou no
 * modelo antigo — `vendas` -> `itens_venda` -> `pagamentos_venda` —, e aquelas
 * tres tabelas tem ZERO linhas, porque nada as escreve: o ERP manda
 * movimentacao. A tela mostrava 0 em tudo com 1.388 documentos e tres anos de
 * historico no banco (01/06/2023 a 24/09/2026, R$ 66,2 mi).
 *
 * Nao era defeito de consulta. Era a migracao de 25/09 que parou na metade.
 * ==========================================================================
 *
 * O REPOSITORIO ANTIGO CONTINUA DE PE, e nao por cortesia: cinco leituras nao
 * vem da venda, e delegar e mais honesto que reescrever.
 *
 *   inventario              — le `produtos` + `estoque`. Ja funcionava
 *   origem, demografia      — leem SO `clientes_perfil` (0 linhas hoje; enchem
 *                             quando a triagem da agente rodar)
 *   giro por fornecedor     — exigem `produtos.data_entrada_estoque`, que esta
 *   giro por familia          preenchida em 0 de 7.196, e `referencia_fornecedor`
 *                             tambem em 0. Migrar devolveria vazio do mesmo
 *                             jeito, com SQL novo para manter
 *
 * QUANDO O ERP MANDAR data de entrada e fornecedor, os dois giros precisam vir
 * para ca tambem — hoje eles leem `vendas`, que continuara vazia.
 *
 * ==========================================================================
 * A TRADUCAO, E O QUE NAO TEM TRADUCAO.
 *
 *   v.data_venda          -> m.data_movimentacao
 *   v.valor_total         -> m.valor
 *   v.status='concluida'  -> m.saida AND m.ativo
 *   receita               -> saidas MENOS devolucoes (a regra do shared)
 *   i.venda_id            -> i.movimentacao_id
 *   i.valor_total_item    -> i.quantidade * i.valor_unitario
 *   i.valor_desconto_item -> NAO EXISTE
 *
 * O DESCONTO SAI ZERO, E ZERO E VERDADE: a soma de quantidade x valor_unitario
 * fecha com o valor do documento em 1.287 de 1.287, com desconto implicito de
 * R$ 0,00. Qualquer desconto ja esta embutido no preco unitario — nao e campo
 * faltando, e a loja nao registrando desconto em linha separada.
 *
 * A DISTRIBUICAO DE PAGAMENTO COBRE 36% DO VALOR: as parcelas somam R$ 23,9 mi
 * dos R$ 66,3 mi, fecham o documento em 416 de 1.287 e 43 vendas nao tem
 * parcela nenhuma. E falha de ingestao, nao de consulta — o grafico fica certo
 * no formato e parcial no valor, e por isso a tela avisa.
 * ==========================================================================
 *
 * TROCAR E DESTROCAR E UMA LINHA, no `analytics.module.ts`, porque a injecao e
 * por token. Nenhum use case, nenhuma rota, nenhum DTO, nenhuma migracao.
 */
@Injectable()
export class AnalyticsDeMovimentacaoRepository implements IAnalyticsRepository {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    // As cinco leituras que nao vem da venda. Ver o bloco acima.
    private readonly doModeloAntigo: AnalyticsRepository,
  ) {}

  /**
   * O recorte da tela sobre a movimentacao (alias `m`).
   *
   * Espelha o `filtroVendas` do repositorio antigo: o JOIN com
   * `clientes_perfil` so entra quando ha filtro demografico — periodo sozinho
   * nao precisa dele —, e tudo vai parametrizado ($n).
   */
  private filtroMovimentacao(
    filtro: FiltroAnalitico | undefined,
    params: unknown[],
  ): { join: string; where: string } {
    let where = '';
    if (filtro?.dataInicio && filtro?.dataFim) {
      params.push(filtro.dataInicio, filtro.dataFim);
      where += ` AND m.data_movimentacao BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    // A EMPRESA DO GRUPO — 02/10/2026. Ausente = todas, somadas como sempre.
    if (filtro?.empresaId?.length) {
      params.push(filtro.empresaId);
      where += ` AND m.empresa_id = ANY($${params.length}::uuid[])`;
    }
    const precisaPerfil =
      filtro?.sexo != null ||
      filtro?.origem != null ||
      filtro?.faixaEtaria != null ||
      filtro?.idadeMin != null ||
      filtro?.idadeMax != null;
    // Compara contra o MESMO rotulo exibido nas distribuicoes (via COALESCE),
    // para que filtrar por "NAO_INFORMADO"/"Nao informado" case as linhas NULL.
    if (filtro?.sexo != null) {
      params.push(filtro.sexo);
      where += ` AND COALESCE(cp.sexo::text, 'NAO_INFORMADO') = ANY($${params.length}::text[])`;
    }
    if (filtro?.origem != null) {
      params.push(filtro.origem);
      where += ` AND COALESCE(cp.origem_contato::text, 'Nao informado') = ANY($${params.length}::text[])`;
    }
    if (filtro?.faixaEtaria != null) {
      params.push(filtro.faixaEtaria);
      where += ` AND COALESCE(NULLIF(cp.faixa_etaria, ''), 'Nao informado') = $${params.length}`;
    }
    if (filtro?.idadeMin != null) {
      params.push(filtro.idadeMin);
      where += ` AND cp.idade >= $${params.length}`;
    }
    if (filtro?.idadeMax != null) {
      params.push(filtro.idadeMax);
      where += ` AND cp.idade <= $${params.length}`;
    }
    const join = precisaPerfil
      ? ' LEFT JOIN clientes_perfil cp ON cp.cliente_id = m.cliente_id'
      : '';
    return { join, where };
  }

  async resumoPeriodo(filtro?: FiltroAnalitico): Promise<ResumoPeriodo> {
    const params: unknown[] = [];
    const { join, where } = this.filtroMovimentacao(filtro, params);

    // O TICKET SAI DA DIVISAO, e nao de um AVG: com a devolucao abatida, a
    // media de `valor` daria um numero que nao e receita/vendas — e a tela de
    // Vendas mostraria outro, para a mesma pergunta.
    const rows = await this.ds.query<{ receita: number; totalVendas: number }[]>(
      `
      WITH recorte AS (
        SELECT m.valor, m.saida, m.entrada, m.ativo
          FROM movimentacoes m${join}
         WHERE m.ativo${where}
      )
      SELECT COALESCE(${receitaLiquida('r')}, 0)::float        AS receita,
             count(*) FILTER (WHERE ${vendaEfetiva('r')})::int AS "totalVendas"
      FROM recorte r
      `,
      params,
    );

    const receita = rows[0]?.receita ?? 0;
    const totalVendas = rows[0]?.totalVendas ?? 0;
    return {
      receita,
      totalVendas,
      ticketMedio: totalVendas > 0 ? receita / totalVendas : 0,
    };
  }

  async receitaMensal(
    janela: { de: Date; ate: Date },
    filtro?: FiltroAnalitico,
  ): Promise<ReceitaMensal> {
    const params: unknown[] = [];
    const { join, where } = this.filtroMovimentacao(filtro, params);
    params.push(FUSO_DA_LOJA);
    const iFuso = params.length;
    params.push(janela.de, janela.ate);
    const iDe = params.length - 1;
    const iAte = params.length;

    // O ESQUELETO VEM DA JANELA e as vendas vem do recorte — mes sem venda tem
    // que aparecer zerado, senao a curva mente sobre a queda.
    //
    // O MES E O DA LOJA: truncar sem fuso usa o do servidor, em UTC, e a venda
    // das 22h do dia 31 cai no mes seguinte.
    //
    // AQUI O ABATIMENTO E POR LINHA (`valorAssinado`) e nao por grupo: a soma
    // acontece sobre o `generate_series`, depois do LEFT JOIN.
    const linhas = await this.ds.query<ReceitaMensalItem[]>(
      `
      WITH serie AS (
        SELECT g::date AS inicio
        FROM generate_series(
          date_trunc('month', $${iDe}::timestamptz AT TIME ZONE $${iFuso}::text),
          date_trunc('month', $${iAte}::timestamptz AT TIME ZONE $${iFuso}::text),
          interval '1 month'
        ) AS g
      ),
      recorte AS (
        SELECT date_trunc('month', m.data_movimentacao AT TIME ZONE $${iFuso}::text)::date AS inicio,
               ${valorAssinado('m')} AS valor,
               ${vendaEfetiva('m')}  AS conta
        FROM movimentacoes m${join}
        WHERE m.ativo${where}
      )
      SELECT to_char(serie.inicio, 'YYYY-MM')                      AS mes,
             COALESCE(SUM(recorte.valor), 0)::float                 AS receita,
             COUNT(*) FILTER (WHERE recorte.conta)::int             AS "totalVendas"
      FROM serie
      LEFT JOIN recorte ON recorte.inicio = serie.inicio
      GROUP BY serie.inicio
      ORDER BY serie.inicio
      `,
      params,
    );

    // A meta e a GLOBAL da loja e nao segue o recorte. Mesma consulta do
    // repositorio antigo: `metas` nao mudou de modelo (e esta vazia hoje — ate
    // alguem cadastrar, a linha fica no zero, e migrar nao resolve isso).
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

  async topProdutos(limit: number, filtro?: FiltroAnalitico): Promise<TopProduto[]> {
    const params: unknown[] = [];
    const { join: joinCp, where: whereDemo } = this.filtroMovimentacao(filtro, params);
    params.push(limit);

    // `descontoTotal` sai ZERO e isso e medido, nao omissao — ver o bloco do
    // topo. Fica como coluna para a tela e o CSV nao mudarem de forma.
    return this.ds.query<TopProduto[]>(
      `
      SELECT i.produto_id AS "produtoId",
             COALESCE(
               NULLIF(p.descricao_etiqueta, ''),
               p.codigo_erp,
               p.categoria || ' ' || p.familia,
               LEFT(i.produto_id::text, 8)
             ) AS nome,
             COUNT(DISTINCT i.movimentacao_id)::int                     AS "totalVendas",
             COALESCE(SUM(i.quantidade * i.valor_unitario), 0)::float   AS receita,
             COALESCE(SUM(i.quantidade), 0)::float                      AS quantidade,
             0::float                                                   AS "descontoTotal",
             COUNT(DISTINCT m.cliente_id)::int                          AS "clientesAtendidos"
      FROM movimentacoes_itens i
      JOIN movimentacoes m ON m.id = i.movimentacao_id AND ${vendaEfetiva('m')}${joinCp}
      LEFT JOIN produtos p ON p.id = i.produto_id
      WHERE i.produto_id IS NOT NULL AND i.ativo${whereDemo}
      GROUP BY i.produto_id, p.descricao_etiqueta, p.codigo_erp, p.categoria, p.familia
      ORDER BY "totalVendas" DESC, receita DESC
      LIMIT $${params.length}
      `,
      params,
    );
  }

  async distribuicaoPagamento(filtro?: FiltroAnalitico): Promise<DistribuicaoPagamento[]> {
    const params: unknown[] = [];
    const { join: joinCp, where: whereDemo } = this.filtroMovimentacao(filtro, params);

    // O NOME VEM DA TABELA, e nao do enum de oito da tela: sao 31 formas reais
    // e 15 em uso. O front cai no `?? forma`, entao o rotulo passa direto.
    return this.ds.query<DistribuicaoPagamento[]>(
      `
      SELECT COALESCE(fp.nome, 'Nao informado')  AS forma,
             COUNT(*)::int                       AS total,
             COALESCE(SUM(mp.valor), 0)::float   AS valor
      FROM movimentacoes_pagamentos mp
      JOIN movimentacoes m ON m.id = mp.movimentacao_id AND ${vendaEfetiva('m')}${joinCp}
      LEFT JOIN formas_pagamento fp ON fp.id = ${formaPagamentoDe('mp')}
      WHERE mp.ativo${whereDemo}
      GROUP BY COALESCE(fp.nome, 'Nao informado')
      ORDER BY valor DESC
      `,
      params,
    );
  }

  async comportamentoDatas(
    janelas: JanelaData[],
    filtro?: FiltroAnalitico,
  ): Promise<ComportamentoData[]> {
    // Uma agregacao por janela (poucas datas — custo baixo). O periodo vem da
    // JANELA, logo o filtro de dataInicio/dataFim NAO se aplica aqui — so
    // sexo/origem/faixa.
    //
    // O corte por sexo fica em NAO_INFORMADO enquanto `clientes_perfil` estiver
    // vazia; os TOTAIS, que e o que a tela mostra em cima, passam a existir.
    return Promise.all(
      janelas.map(async (j) => {
        const params: unknown[] = [j.de, j.ate];
        const semPeriodo: FiltroAnalitico | undefined = filtro
          ? { ...filtro, dataInicio: undefined, dataFim: undefined }
          : undefined;
        const { where: whereDemo } = this.filtroMovimentacao(semPeriodo, params);
        const rows = await this.ds.query<
          { sexo: string; totalCompras: number; valorTotal: number }[]
        >(
          `
          SELECT COALESCE(cp.sexo::text, 'NAO_INFORMADO')  AS sexo,
                 COUNT(*)::int                             AS "totalCompras",
                 COALESCE(SUM(m.valor), 0)::float          AS "valorTotal"
          FROM movimentacoes m
          LEFT JOIN clientes_perfil cp ON cp.cliente_id = m.cliente_id
          WHERE ${vendaEfetiva('m')}
            AND m.data_movimentacao BETWEEN $1 AND $2${whereDemo}
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

  async linhasVendaCsv(dataInicio?: Date, dataFim?: Date): Promise<LinhaVendaCsv[]> {
    const params: unknown[] = [];
    let filtro = '';
    if (dataInicio && dataFim) {
      params.push(dataInicio, dataFim);
      filtro = 'WHERE m.data_movimentacao BETWEEN $1 AND $2';
    }

    // A EXPORTACAO LEVA OS TRES ESTADOS, como antes: a coluna `status` diz qual
    // e, e devolucao e cancelamento sao justamente o que alguem confere na
    // planilha. O `GROUP BY` carrega `ativo` e `entrada` porque o status e
    // derivado deles.
    return this.ds.query<LinhaVendaCsv[]>(
      `
      SELECT m.id                                                          AS id,
             to_char(m.data_movimentacao, 'YYYY-MM-DD"T"HH24:MI:SSZ')       AS "dataVenda",
             m.cliente_id                                                  AS "clienteId",
             m.vendedora_id                                                AS "vendedoraId",
             m.valor::float                                                AS "valorTotal",
             ${STATUS_DE_MOVIMENTACAO}                                     AS status,
             COALESCE(string_agg(DISTINCT fp.nome, '|'), '')               AS "formasPagamento"
      FROM movimentacoes m
      LEFT JOIN movimentacoes_pagamentos mp ON mp.movimentacao_id = m.id AND mp.ativo
      LEFT JOIN formas_pagamento fp ON fp.id = ${formaPagamentoDe('mp')}
      ${filtro}
      GROUP BY m.id, m.data_movimentacao, m.cliente_id, m.vendedora_id, m.valor,
               m.ativo, m.entrada
      ORDER BY m.data_movimentacao DESC
      `,
      params,
    );
  }

  /**
   * As empresas que aparecem no filtro — ver `EMPRESAS_COM_MOVIMENTO`.
   *
   * A MESMA CONSULTA DA TELA DE VENDAS, do mesmo arquivo: as duas telas tem
   * de oferecer as mesmas opcoes.
   */
  async empresasComMovimento(): Promise<{ id: string; nome: string }[]> {
    return this.ds.query<{ id: string; nome: string }[]>(EMPRESAS_COM_MOVIMENTO);
  }

  // ---- as cinco que nao vem da venda ------------------------------------

  giroEstoquePorFornecedor(filtro?: FiltroAnalitico): Promise<GiroFornecedor[]> {
    return this.doModeloAntigo.giroEstoquePorFornecedor(filtro);
  }

  giroEstoquePorFamilia(filtro?: FiltroAnalitico): Promise<GiroFamilia[]> {
    return this.doModeloAntigo.giroEstoquePorFamilia(filtro);
  }

  estatisticasInventario(): Promise<EstatisticasInventario> {
    return this.doModeloAntigo.estatisticasInventario();
  }

  distribuicaoOrigem(filtro?: FiltroAnalitico): Promise<DistribuicaoOrigem[]> {
    return this.doModeloAntigo.distribuicaoOrigem(filtro);
  }

  demografia(filtro?: FiltroAnalitico): Promise<Demografia> {
    return this.doModeloAntigo.demografia(filtro);
  }
}
