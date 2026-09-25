import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FUSO_DA_LOJA } from '../../../../../../shared/erp/data-do-erp';
import type { StatusVenda } from '../../../../domain/entities/enums';
import type {
  ComparativoVendedora,
  FiltroVenda,
  ResumoVendas,
  SerieMensalVendas,
  VendaResumo,
} from '../../../../domain/ports/repositories/venda-repository.port';
import type { IVendasLeituraRepository } from '../../../../domain/ports/repositories/vendas-leitura-repository.port';

const LIMIT_PADRAO = 50;
const LIMIT_MAXIMO = 200;

/**
 * A tela de Vendas lida da MOVIMENTACAO. Ver a porta para a decisao de 25/09.
 *
 * ==========================================================================
 * O STATUS E DERIVADO, E OS TRES SAO DE VERDADE.
 *
 *   saida  + ativo   -> concluida
 *   entrada + ativo  -> devolvida   (a devolucao de venda)
 *   ativo = false    -> cancelada   (e como o ERP cancela: reenvio com false)
 *
 * `pendente` nao existe: a movimentacao so nasce depois de o fato acontecer.
 *
 * DEVOLVIDA VIRA LINHA NA LISTA — decisao do Lucas, "ter o registro" — e
 * ABATE NA RECEITA, nos tres lugares: resumo, comparativo e serie mensal.
 *
 * ==========================================================================
 * O ABATIMENTO NAO E PREFERENCIA CONTABIL: E ALINHAMENTO COM O WHATSAPP.
 *
 * A ferramenta da Anastasia (commit 34bc8c3, da manha de 25/09) ja descontava
 * a devolucao. Com a tela somando so as saidas, a MESMA pergunta teria duas
 * respostas: R$ 1.213.806,50 na tela e R$ 934.126,50 no WhatsApp, para agosto
 * de 2026. Decisao do Lucas ao ver a divergencia:
 *
 *   "front e o whats devem estar alinhados.. sem informacoes divergentes"
 *
 * Duas respostas para a mesma pergunta e pior que qualquer uma das duas.
 * ==========================================================================
 *
 * A CONTAGEM continua sendo so das vendas — 20 vendas, e nao 26. As 6
 * devolucoes aparecem no `porStatus` e como linha, entao da para reconciliar
 * o numero na propria tela.
 *
 * NAO PRECISOU DE MIGRACAO: o read-model devolve texto, e `status_venda` (o
 * enum do banco) nao e usado aqui.
 * ==========================================================================
 *
 * A FORMA DE PAGAMENTO VEM PELO `_id_erp`, E ISSO E UM CONTORNO.
 *
 * `movimentacoes_pagamentos.forma_pagamento_id` esta NULO nas 1.730 parcelas —
 * a ingestao nao resolve essa ponta, e e um defeito nosso, pequeno e separado.
 * Mas o dado esta la: o integrador manda o NOSSO uuid dentro do campo
 * `forma_pagamento_id_erp`, e os 15 valores distintos casam todos com
 * `formas_pagamento`. Entao o JOIN e por ele.
 *
 * QUANDO A INGESTAO FOR CORRIGIDA, este COALESCE continua certo — ele ja
 * prefere o id resolvido.
 *
 * E O NOME VEM DA TABELA, e nao do enum de oito valores da tela: sao 31 formas
 * reais (Promissoria, Boleto, Cheque, Stone, Rede, Cielo, Bradesco 467308...).
 * Decisao do Lucas: "coloque o que nos temos na tabela".
 */
@Injectable()
export class VendasDeMovimentacaoRepository implements IVendasLeituraRepository {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  /**
   * As condicoes comuns as quatro consultas.
   *
   * O STATUS E FILTRADO PELO TEXTO DERIVADO, e nao por uma coluna: e a unica
   * forma de a tela continuar mandando `status=concluida` e funcionar.
   */
  private filtro(
    f: FiltroVenda,
    params: unknown[],
  ): { where: string; joinPagamento: string } {
    const conds: string[] = [];

    if (f.dataDe) {
      params.push(f.dataDe);
      conds.push(`m.data_movimentacao >= $${params.length}`);
    }
    if (f.dataAte) {
      params.push(f.dataAte);
      conds.push(`m.data_movimentacao <= $${params.length}`);
    }
    if (f.clienteId) {
      params.push(f.clienteId);
      conds.push(`m.cliente_id = $${params.length}`);
    }
    if (f.vendedoraId?.length) {
      params.push(f.vendedoraId);
      conds.push(`m.vendedora_id = ANY($${params.length}::uuid[])`);
    }
    if (f.status?.length) {
      params.push(f.status);
      conds.push(`${STATUS_SQL} = ANY($${params.length}::text[])`);
    }

    let joinPagamento = '';
    if (f.formaPagamento?.length) {
      params.push(f.formaPagamento);
      // EXISTS e nao JOIN: a venda com tres parcelas em Boleto apareceria tres
      // vezes na lista, e o valor seria somado tres vezes no resumo.
      joinPagamento = `
        AND EXISTS (
          SELECT 1
            FROM movimentacoes_pagamentos mp
            LEFT JOIN formas_pagamento fp
              ON fp.id = COALESCE(mp.forma_pagamento_id, mp.forma_pagamento_id_erp::uuid)
           WHERE mp.movimentacao_id = m.id
             AND mp.ativo
             AND fp.nome = ANY($${params.length}::text[])
        )`;
    }

    return {
      where: conds.length ? `AND ${conds.join(' AND ')}` : '',
      joinPagamento,
    };
  }

  async listar(filtros: FiltroVenda): Promise<VendaResumo[]> {
    const params: unknown[] = [];
    const { where, joinPagamento } = this.filtro(filtros, params);

    params.push(Math.min(filtros.limit ?? LIMIT_PADRAO, LIMIT_MAXIMO));
    const iLimit = params.length;
    params.push(filtros.offset ?? 0);
    const iOffset = params.length;

    const linhas = await this.ds.query<LinhaListagem[]>(
      `
      SELECT
        m.id,
        m.id_erp                                   AS codigo_erp,
        m.cliente_id,
        m.vendedora_id,
        vd.nome                                    AS vendedora_nome,
        m.data_movimentacao                        AS data_venda,
        m.valor                                    AS valor_bruto,
        m.valor                                    AS valor_total,
        ${STATUS_SQL}                              AS status,
        m.ativo,
        prin.rotulo                                AS produto_principal,
        COALESCE(qi.qtd, 0)                        AS qtd_itens,
        fp.formas                                  AS formas_pagamento,
        m.criado_em,
        m.atualizado_em
      FROM movimentacoes m
      LEFT JOIN vendedoras vd ON vd.id = m.vendedora_id
      -- A peca de MAIOR VALOR representa o documento, como na consulta antiga.
      LEFT JOIN LATERAL (
        SELECT COALESCE(p.descricao_etiqueta, p.codigo_erp, LEFT(i.produto_id::text, 8))
                 AS rotulo
          FROM movimentacoes_itens i
          LEFT JOIN produtos p ON p.id = i.produto_id
         WHERE i.movimentacao_id = m.id AND i.ativo
         ORDER BY i.quantidade * i.valor_unitario DESC
         LIMIT 1
      ) prin ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS qtd
          FROM movimentacoes_itens i
         WHERE i.movimentacao_id = m.id AND i.ativo
      ) qi ON TRUE
      LEFT JOIN LATERAL (
        SELECT array_agg(DISTINCT f.nome ORDER BY f.nome) AS formas
          FROM movimentacoes_pagamentos mp
          JOIN formas_pagamento f
            ON f.id = COALESCE(mp.forma_pagamento_id, mp.forma_pagamento_id_erp::uuid)
         WHERE mp.movimentacao_id = m.id AND mp.ativo
      ) fp ON TRUE
      WHERE TRUE ${where} ${joinPagamento}
      ORDER BY m.data_movimentacao DESC
      LIMIT $${iLimit} OFFSET $${iOffset}
      `,
      params,
    );

    return linhas.map((l) => ({
      id: l.id,
      codigoErp: l.codigo_erp,
      clienteId: l.cliente_id,
      vendedoraId: l.vendedora_id,
      vendedoraNome: l.vendedora_nome,
      dataVenda: l.data_venda,
      // A movimentacao nao tem data de contato nem desconto. Vao nulos e
      // zerados de proposito — inventar um valor seria pior que a lacuna.
      dataContato: null,
      valorBruto: Number(l.valor_bruto),
      valorDesconto: 0,
      valorTotal: Number(l.valor_total),
      status: l.status,
      ativo: l.ativo,
      produtoPrincipal: l.produto_principal,
      qtdItens: Number(l.qtd_itens),
      // O tipo diz `FormaPagamento[]` (o enum de oito), mas o que sai sao os
      // nomes da tabela. O front ja tem o fallback para texto desconhecido.
      formasPagamento: (l.formas_pagamento ??
        []) as VendaResumo['formasPagamento'],
      criadoEm: l.criado_em,
      atualizadoEm: l.atualizado_em,
    }));
  }

  async resumoAgregado(filtros: FiltroVenda): Promise<ResumoVendas> {
    const params: unknown[] = [];
    const { where, joinPagamento } = this.filtro(filtros, params);

    // RECEITA SO DAS CONCLUIDAS, como na consulta antiga — mas agora a
    // devolucao existe e e contada a parte, em vez de somar como se fosse
    // venda ou sumir sem deixar rastro.
    // UMA CTE COM O RECORTE, e os quatro numeros saindo dela. A alternativa
    // era repetir o filtro dentro da subconsulta de itens, com o alias
    // trocado — e um filtro escrito duas vezes e um filtro que diverge.
    const [linha] = await this.ds.query<LinhaResumo[]>(
      `
      WITH filtrados AS (
        SELECT m.id, m.valor, m.saida, m.entrada, m.ativo
          FROM movimentacoes m
         WHERE TRUE ${where} ${joinPagamento}
      )
      SELECT
        count(*) FILTER (WHERE f.saida AND f.ativo)                    AS concluidas,
        COALESCE(sum(f.valor) FILTER (WHERE f.saida AND f.ativo), 0)
          - COALESCE(sum(f.valor) FILTER (WHERE f.entrada AND f.ativo), 0)
                                                                       AS receita,
        count(*) FILTER (WHERE f.entrada AND f.ativo)                  AS devolvidas,
        count(*) FILTER (WHERE NOT f.ativo)                            AS canceladas,
        COALESCE((
          SELECT sum(i.quantidade)
            FROM movimentacoes_itens i
            JOIN filtrados fi ON fi.id = i.movimentacao_id
           WHERE i.ativo AND fi.saida AND fi.ativo
        ), 0)                                                          AS total_itens
      FROM filtrados f
      `,
      params,
    );

    const totalVendas = Number(linha?.concluidas ?? 0);
    const receitaTotal = Number(linha?.receita ?? 0);

    return {
      totalVendas,
      receitaTotal,
      ticketMedio: totalVendas > 0 ? receitaTotal / totalVendas : 0,
      totalItens: Number(linha?.total_itens ?? 0),
      porStatus: {
        concluida: totalVendas,
        devolvida: Number(linha?.devolvidas ?? 0),
        cancelada: Number(linha?.canceladas ?? 0),
        // Nao existe venda pendente numa movimentacao; fica zero e a tela
        // deixa de mostrar um estado que nunca acontece.
        pendente: 0,
      },
    };
  }

  async comparativoPorVendedora(
    filtros: FiltroVenda,
  ): Promise<ComparativoVendedora[]> {
    const params: unknown[] = [];
    const { where, joinPagamento } = this.filtro(filtros, params);

    const linhas = await this.ds.query<LinhaComparativo[]>(
      `
      SELECT
        m.vendedora_id,
        vd.nome                                        AS vendedora_nome,
        count(*) FILTER (WHERE m.saida)                AS total_vendas,
        COALESCE(sum(m.valor) FILTER (WHERE m.saida), 0)
          - COALESCE(sum(m.valor) FILTER (WHERE m.entrada), 0)
                                                       AS receita,
        COALESCE(sum(qi.qtd) FILTER (WHERE m.saida), 0) AS qtd_pecas,
        count(DISTINCT m.cliente_id) FILTER (WHERE m.saida)
                                                       AS clientes_atendidos
      FROM movimentacoes m
      LEFT JOIN vendedoras vd ON vd.id = m.vendedora_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(i.quantidade), 0) AS qtd
          FROM movimentacoes_itens i
         WHERE i.movimentacao_id = m.id AND i.ativo
      ) qi ON TRUE
      WHERE m.ativo ${where} ${joinPagamento}
      GROUP BY m.vendedora_id, vd.nome
     HAVING count(*) FILTER (WHERE m.saida) > 0
      ORDER BY receita DESC
      `,
      params,
    );

    return linhas.map((l) => {
      const total = Number(l.total_vendas);
      const receita = Number(l.receita);
      return {
        vendedoraId: l.vendedora_id,
        vendedoraNome: l.vendedora_nome,
        totalVendas: total,
        receita,
        ticketMedio: total > 0 ? receita / total : 0,
        // Sem desconto na movimentacao. Ver o comentario da listagem.
        descontoTotal: 0,
        qtdPecas: Number(l.qtd_pecas),
        clientesAtendidos: Number(l.clientes_atendidos),
      };
    });
  }

  async serieMensal(
    filtros: FiltroVenda,
    janela: { de: Date; ate: Date },
  ): Promise<SerieMensalVendas> {
    const params: unknown[] = [];
    const { where, joinPagamento } = this.filtro(filtros, params);

    params.push(FUSO_DA_LOJA);
    const iFuso = params.length;
    params.push(janela.de);
    const iDe = params.length;
    params.push(janela.ate);
    const iAte = params.length;

    // O ESQUELETO VEM DA JANELA, como no `/analytics/receita-mensal`: mes sem
    // venda tem que aparecer zerado, senao a curva mente sobre a queda.
    //
    // O MES E O DA LOJA: truncar sem fuso usa o do servidor, em UTC, e a venda
    // das 22h do dia 31 cai no mes seguinte.
    const linhas = await this.ds.query<{ mes: string; receita: string; total: string }[]>(
      `
      WITH serie AS (
        SELECT generate_series(
                 date_trunc('month', $${iDe}::timestamptz AT TIME ZONE $${iFuso}),
                 date_trunc('month', $${iAte}::timestamptz AT TIME ZONE $${iFuso}),
                 interval '1 month'
               ) AS mes
      ),
      vendas AS (
        SELECT date_trunc('month', m.data_movimentacao AT TIME ZONE $${iFuso}) AS mes,
               COALESCE(sum(m.valor) FILTER (WHERE m.saida), 0)
                 - COALESCE(sum(m.valor) FILTER (WHERE m.entrada), 0) AS receita,
               count(*) FILTER (WHERE m.saida)                        AS total
          FROM movimentacoes m
         WHERE m.ativo
           AND m.data_movimentacao >= $${iDe}
           AND m.data_movimentacao <= $${iAte}
           ${where} ${joinPagamento}
         GROUP BY 1
      )
      SELECT to_char(s.mes, 'YYYY-MM')     AS mes,
             COALESCE(v.receita, 0)        AS receita,
             COALESCE(v.total, 0)          AS total
        FROM serie s
        LEFT JOIN vendas v ON v.mes = s.mes
       ORDER BY s.mes
      `,
      params,
    );

    // A meta vigente da loja — a MESMA consulta do repositorio antigo e do
    // `/analytics/receita-mensal`. Ela nao vem da movimentacao e nao muda.
    const [meta] = await this.ds.query<{ meta: number }[]>(
      `
      SELECT COALESCE(valor_alvo, 0)::float AS meta
        FROM metas
       WHERE tipo = 'GLOBAL' AND prazo >= now()
       ORDER BY criado_em DESC
       LIMIT 1
      `,
    );

    return {
      meses: linhas.map((l) => ({
        mes: l.mes,
        receita: Number(l.receita),
        totalVendas: Number(l.total),
      })),
      meta: meta?.meta ?? 0,
    };
  }
}

/**
 * O status, derivado em SQL — usado tanto no SELECT quanto no filtro.
 *
 * Fica numa constante porque as duas usos TEM que concordar: filtrar por
 * `concluida` e receber linhas marcadas de outro jeito seria um defeito mudo.
 */
const STATUS_SQL = `
  CASE
    WHEN NOT m.ativo    THEN 'cancelada'
    WHEN m.entrada      THEN 'devolvida'
    ELSE                     'concluida'
  END`;

interface LinhaListagem {
  id: string;
  codigo_erp: string | null;
  cliente_id: string | null;
  vendedora_id: string | null;
  vendedora_nome: string | null;
  data_venda: Date;
  valor_bruto: string;
  valor_total: string;
  status: StatusVenda;
  ativo: boolean;
  produto_principal: string | null;
  qtd_itens: number;
  formas_pagamento: string[] | null;
  criado_em: Date;
  atualizado_em: Date;
}

interface LinhaResumo {
  concluidas: string;
  receita: string;
  devolvidas: string;
  canceladas: string;
  total_itens: string;
}

interface LinhaComparativo {
  vendedora_id: string | null;
  vendedora_nome: string | null;
  total_vendas: string;
  receita: string;
  qtd_pecas: string;
  clientes_atendidos: string;
}
