import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  ComparacaoAnual,
  IVendasMovimentacaoRepository,
  ItemMaisVendido,
  VendedoraPorFamilia,
  VendedoraPorFamiliaNoAno,
  JanelaDeVendas,
  ResumoDeVendas,
  VendedoraNoRanking,
} from '../../../../domain/ports/repositories/vendas-movimentacao-repository.port';

/**
 * A venda lida da movimentacao. Ver a porta para o porque.
 *
 * ==========================================================================
 * O QUE E VENDA E O QUE E DEVOLUCAO, AQUI DENTRO.
 *
 * Nao se olha o NOME da operacao: `saida` e `entrada` sao colunas booleanas do
 * proprio documento, gravadas pelo ERP, e sobrevivem a alguem renomear
 * "DEVOLUCAO DE VENDA" para outra coisa amanha. Na copia de 25/09 as duas
 * classificacoes batem exatamente — 1.287 saidas para 1.287 VENDA, 101
 * entradas para 101 DEVOLUCAO.
 *
 * `ativo = true` em todas as contas: documento cancelado no ERP chega como
 * reenvio com `ativo: false`, e cancelado nao e venda.
 * ==========================================================================
 */
@Injectable()
export class VendasMovimentacaoRepository
  implements IVendasMovimentacaoRepository
{
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  async resumo(
    janela: JanelaDeVendas,
    vendedoraId?: string | null,
  ): Promise<ResumoDeVendas> {
    // UMA VARREDURA SO para os quatro numeros. Duas consultas separadas
    // dariam o mesmo resultado e leriam a tabela duas vezes — e esta e a
    // consulta que toda pergunta sobre venda vai passar.
    const [linha] = await this.ds.query<
      {
        quantidade: string;
        valor_vendas: string;
        devolucoes: string;
        valor_devolvido: string;
      }[]
    >(
      `
      SELECT
        count(*) FILTER (WHERE m.saida)                       AS quantidade,
        COALESCE(sum(m.valor) FILTER (WHERE m.saida), 0)      AS valor_vendas,
        count(*) FILTER (WHERE m.entrada)                     AS devolucoes,
        COALESCE(sum(m.valor) FILTER (WHERE m.entrada), 0)    AS valor_devolvido
        FROM movimentacoes m
       WHERE m.ativo
         AND m.data_movimentacao >= $1
         AND m.data_movimentacao <= $2
         AND ($3::uuid IS NULL OR m.vendedora_id = $3::uuid)
      `,
      [janela.de, janela.ate, vendedoraId ?? null],
    );

    const quantidade = Number(linha?.quantidade ?? 0);
    const vendas = Number(linha?.valor_vendas ?? 0);
    const valorDevolvido = Number(linha?.valor_devolvido ?? 0);
    const receita = vendas - valorDevolvido;

    return {
      quantidade,
      receita,
      // O ticket usa a receita LIQUIDA: um mes com devolucao grande tem ticket
      // menor, e e essa a leitura util.
      ticketMedio: quantidade > 0 ? receita / quantidade : 0,
      devolucoes: Number(linha?.devolucoes ?? 0),
      valorDevolvido,
    };
  }

  async rankingDeVendedoras(
    janela: JanelaDeVendas,
    limite: number,
  ): Promise<VendedoraNoRanking[]> {
    // A DEVOLUCAO ABATE NA VENDEDORA CERTA: o documento de devolucao carrega a
    // vendedora da venda original, entao o LEFT JOIN cobre o caso de ela ter
    // so devolucao no periodo — e aparecer com valor negativo, que e verdade.
    const linhas = await this.ds.query<
      {
        vendedora_id: string;
        nome: string | null;
        codigo_erp: string | null;
        quantidade: string;
        valor: string;
      }[]
    >(
      `
      SELECT v.id                                                AS vendedora_id,
             v.nome                                              AS nome,
             v.codigo_erp                                        AS codigo_erp,
             count(*) FILTER (WHERE m.saida)                     AS quantidade,
             COALESCE(sum(m.valor) FILTER (WHERE m.saida), 0)
               - COALESCE(sum(m.valor) FILTER (WHERE m.entrada), 0) AS valor
        FROM movimentacoes m
        JOIN vendedoras v ON v.id = m.vendedora_id
       WHERE m.ativo
         AND m.data_movimentacao >= $1
         AND m.data_movimentacao <= $2
       GROUP BY v.id, v.nome, v.codigo_erp
      HAVING count(*) FILTER (WHERE m.saida) > 0
       ORDER BY valor DESC
       LIMIT $3
      `,
      [janela.de, janela.ate, limite],
    );

    return linhas.map((l) => ({
      vendedoraId: l.vendedora_id,
      nome: l.nome ?? '',
      codigoErp: l.codigo_erp,
      quantidade: Number(l.quantidade),
      valor: Number(l.valor),
    }));
  }

  async itensMaisVendidos(
    janela: JanelaDeVendas,
    limite: number,
    vendedoraId?: string | null,
    familia?: string | null,
  ): Promise<ItemMaisVendido[]> {
    // SO AS SAIDAS. A devolucao nao abate item por item de proposito: ela
    // volta o documento inteiro, e descontar a peca devolvida de "o que mais
    // saiu" misturaria duas perguntas. O resumo ja mostra o valor devolvido.
    const linhas = await this.ds.query<
      {
        produto_id: string;
        codigo_erp: string | null;
        descricao: string | null;
        familia: string | null;
        quantidade: string;
        valor: string;
      }[]
    >(
      `
      SELECT p.id                                    AS produto_id,
             p.codigo_erp                            AS codigo_erp,
             p.descricao_etiqueta                    AS descricao,
             p.familia                               AS familia,
             sum(i.quantidade)                       AS quantidade,
             sum(i.quantidade * i.valor_unitario)    AS valor
        FROM movimentacoes_itens i
        JOIN movimentacoes m ON m.id = i.movimentacao_id
        JOIN produtos p      ON p.id = i.produto_id
       WHERE m.ativo
         AND m.saida
         AND i.ativo
         AND m.data_movimentacao >= $1
         AND m.data_movimentacao <= $2
         AND ($4::uuid IS NULL OR m.vendedora_id = $4::uuid)
         -- A familia casa por IGUALDADE sem caixa, e nao por LIKE: no catalogo
         -- ela e um rotulo fechado ('BRINCO', 'ANEL'), e um LIKE faria
         -- "anel" tambem trazer "PAINEL" se um dia existir.
         AND ($5::text IS NULL OR upper(p.familia) = upper($5::text))
       GROUP BY p.id, p.codigo_erp, p.descricao_etiqueta, p.familia
       ORDER BY valor DESC
       LIMIT $3
      `,
      [janela.de, janela.ate, limite, vendedoraId ?? null, familia ?? null],
    );

    return linhas.map((l) => ({
      produtoId: l.produto_id,
      codigoErp: l.codigo_erp,
      descricao: l.descricao,
      familia: l.familia,
      quantidade: Number(l.quantidade),
      valor: Number(l.valor),
    }));
  }

  async rankingPorFamilia(
    janela: JanelaDeVendas,
    familia: string,
    limite: number,
  ): Promise<VendedoraPorFamilia[]> {
    // ====================================================================
    // AQUI A DEVOLUCAO ABATE — e o `itensMaisVendidos`, logo acima, NAO.
    //
    // Nao e incoerencia: sao perguntas diferentes.
    //
    //   "que peca mais saiu"  -> a peca saiu, e voltar e outro evento. Abater
    //                            misturaria as duas coisas (decisao registrada
    //                            no metodo acima).
    //   "quem mais VENDEU"    -> se ela vendeu dez e tres voltaram, ela vendeu
    //                            sete. Um ranking de PESSOAS que nao abate
    //                            premia quem vende e perde a venda.
    //
    // E e a mesma regra do `rankingDeVendedoras`, que abate desde 25/09 — este
    // ranking e o irmao dele com um filtro, e tem de contar igual.
    // ====================================================================
    const linhas = await this.ds.query<
      {
        vendedora_id: string;
        nome: string;
        quantidade: string;
        valor: string;
      }[]
    >(
      `
      SELECT v.id   AS vendedora_id,
             v.nome AS nome,
             COALESCE(sum(i.quantidade) FILTER (WHERE m.saida), 0)
               - COALESCE(sum(i.quantidade) FILTER (WHERE m.entrada), 0) AS quantidade,
             COALESCE(sum(i.quantidade * i.valor_unitario) FILTER (WHERE m.saida), 0)
               - COALESCE(sum(i.quantidade * i.valor_unitario) FILTER (WHERE m.entrada), 0) AS valor
        FROM movimentacoes_itens i
        JOIN movimentacoes m ON m.id = i.movimentacao_id
        JOIN produtos p      ON p.id = i.produto_id
        JOIN vendedoras v    ON v.id = m.vendedora_id
       WHERE m.ativo
         AND i.ativo
         AND m.data_movimentacao >= $1
         AND m.data_movimentacao <= $2
         AND upper(p.familia) = upper($3::text)
       GROUP BY v.id, v.nome
      -- QUEM SO DEVOLVEU NO PERIODO FICA DE FORA: sem esta linha ela
      -- apareceria com quantidade negativa no ranking de "quem mais vende",
      -- que e verdade sobre o saldo e absurdo como resposta.
      HAVING COALESCE(sum(i.quantidade) FILTER (WHERE m.saida), 0)
               - COALESCE(sum(i.quantidade) FILTER (WHERE m.entrada), 0) > 0
       ORDER BY quantidade DESC, valor DESC
       LIMIT $4
      `,
      [janela.de, janela.ate, familia, limite],
    );

    return linhas.map((l) => ({
      vendedoraId: l.vendedora_id,
      nome: l.nome,
      quantidade: Number(l.quantidade),
      valor: Number(l.valor),
    }));
  }
  /**
   * O mesmo mes, ano a ano — 29/09/2026.
   *
   * ====================================================================
   * DOIS TOTAIS NUMA VARREDURA SO.
   *
   * `FILTER` da os dois recortes — ate o dia e o mes inteiro — lendo a
   * tabela uma vez. Duas consultas dariam o mesmo e leriam duas vezes o
   * historico inteiro, que e o que esta consulta atravessa por definicao.
   *
   * A DEVOLUCAO ABATE: `saida` menos `entrada`, a mesma regra do `resumo`.
   * Um mes com muita devolucao aparecendo inflado tornaria a comparacao
   * entre anos pior que nao ter comparacao.
   *
   * `$2::int IS NULL` (sem corte) faz o FILTER passar tudo, e os dois
   * totais voltam iguais — que e o comportamento certo para mes fechado.
   * ====================================================================
   */
  async compararMesNosAnos(
    mes: number,
    dia: number | null,
    vendedoraId: string | null,
  ): Promise<ComparacaoAnual[]> {
    const linhas = await this.ds.query<
      {
        ano: string;
        receita: string;
        quantidade: string;
        receita_fechada: string;
      }[]
    >(
      `
      SELECT extract(year from m.data_movimentacao)::int AS ano,

             COALESCE(sum(m.valor) FILTER (
               WHERE m.saida
                 AND ($2::int IS NULL OR extract(day from m.data_movimentacao) <= $2::int)
             ), 0)
             - COALESCE(sum(m.valor) FILTER (
               WHERE m.entrada
                 AND ($2::int IS NULL OR extract(day from m.data_movimentacao) <= $2::int)
             ), 0) AS receita,

             count(*) FILTER (
               WHERE m.saida
                 AND ($2::int IS NULL OR extract(day from m.data_movimentacao) <= $2::int)
             ) AS quantidade,

             COALESCE(sum(m.valor) FILTER (WHERE m.saida), 0)
             - COALESCE(sum(m.valor) FILTER (WHERE m.entrada), 0) AS receita_fechada

        FROM movimentacoes m
       WHERE m.ativo
         AND extract(month from m.data_movimentacao) = $1
         AND ($3::uuid IS NULL OR m.vendedora_id = $3::uuid)
       GROUP BY 1
       ORDER BY 1 DESC
      `,
      [mes, dia, vendedoraId],
    );

    return linhas.map(paraComparacao);
  }

  /**
   * O mesmo (mes, dia) inicial e final, em cada ano.
   *
   * A COMPARACAO DE TUPLA `(mes, dia) BETWEEN (m1,d1) AND (m2,d2)` e o que
   * torna isto uma consulta so. Escrever a mao — "mes maior, ou mes igual e
   * dia maior ou igual" — daria o mesmo plano e quatro linhas de condicao
   * onde e facil trocar um `>` por `>=` sem ninguem notar.
   *
   * Intervalo que vira o ano ja foi recusado no caso de uso: aqui ele
   * simplesmente nao casaria com nada, e devolver vazio esconderia o motivo.
   */
  async compararPeriodoNosAnos(
    inicio: { mes: number; dia: number },
    fim: { mes: number; dia: number },
    vendedoraId: string | null,
  ): Promise<ComparacaoAnual[]> {
    const linhas = await this.ds.query<
      {
        ano: string;
        receita: string;
        quantidade: string;
        receita_fechada: string;
      }[]
    >(
      `
      SELECT extract(year from m.data_movimentacao)::int AS ano,
             COALESCE(sum(m.valor) FILTER (WHERE m.saida), 0)
             - COALESCE(sum(m.valor) FILTER (WHERE m.entrada), 0) AS receita,
             count(*) FILTER (WHERE m.saida) AS quantidade,
             COALESCE(sum(m.valor) FILTER (WHERE m.saida), 0)
             - COALESCE(sum(m.valor) FILTER (WHERE m.entrada), 0) AS receita_fechada
        FROM movimentacoes m
       WHERE m.ativo
         AND (extract(month from m.data_movimentacao),
              extract(day   from m.data_movimentacao))
             BETWEEN ($1::int, $2::int) AND ($3::int, $4::int)
         AND ($5::uuid IS NULL OR m.vendedora_id = $5::uuid)
       GROUP BY 1
       ORDER BY 1 DESC
      `,
      [inicio.mes, inicio.dia, fim.mes, fim.dia, vendedoraId],
    );

    return linhas.map(paraComparacao);
  }

  async rankingPorFamiliaNoMes(
    mes: number,
    familia: string,
    porAno: number,
  ): Promise<VendedoraPorFamiliaNoAno[]> {
    // ====================================================================
    // O `ROW_NUMBER` E O QUE FAZ O "TOP N POR ANO".
    //
    // Sem ele, um `LIMIT` cortaria o ranking INTEIRO e nao o de cada ano: os
    // dez primeiros poderiam ser todos de 2025, e 2023 sumiria da resposta
    // sem nada dizer. A pergunta e "quem ganhou em cada outubro", entao o
    // corte tem de ser por ano.
    //
    // A DEVOLUCAO ABATE, pelo mesmo motivo do `rankingPorFamilia`: e ranking
    // de PESSOA. E o `HAVING > 0` tira quem so devolveu — quantidade negativa
    // e verdade sobre o saldo e absurdo como resposta a "quem mais vendeu".
    // ====================================================================
    const linhas = await this.ds.query<
      {
        ano: string;
        vendedora_id: string;
        nome: string;
        quantidade: string;
        valor: string;
      }[]
    >(
      `
      WITH por_ano AS (
        SELECT extract(year from m.data_movimentacao)::int AS ano,
               v.id   AS vendedora_id,
               v.nome AS nome,
               COALESCE(sum(i.quantidade) FILTER (WHERE m.saida), 0)
                 - COALESCE(sum(i.quantidade) FILTER (WHERE m.entrada), 0) AS quantidade,
               COALESCE(sum(i.quantidade * i.valor_unitario) FILTER (WHERE m.saida), 0)
                 - COALESCE(sum(i.quantidade * i.valor_unitario) FILTER (WHERE m.entrada), 0) AS valor
          FROM movimentacoes_itens i
          JOIN movimentacoes m ON m.id = i.movimentacao_id
          JOIN produtos p      ON p.id = i.produto_id
          JOIN vendedoras v    ON v.id = m.vendedora_id
         WHERE m.ativo
           AND i.ativo
           AND extract(month from m.data_movimentacao) = $1
           AND upper(p.familia) = upper($2::text)
         GROUP BY 1, 2, 3
        HAVING COALESCE(sum(i.quantidade) FILTER (WHERE m.saida), 0)
                 - COALESCE(sum(i.quantidade) FILTER (WHERE m.entrada), 0) > 0
      )
      SELECT ano, vendedora_id, nome, quantidade, valor
        FROM (
          SELECT *,
                 row_number() OVER (
                   PARTITION BY ano ORDER BY quantidade DESC, valor DESC
                 ) AS posicao
            FROM por_ano
        ) r
       WHERE r.posicao <= $3
       ORDER BY ano DESC, quantidade DESC
      `,
      [mes, familia, porAno],
    );

    return linhas.map((l) => ({
      ano: Number(l.ano),
      vendedoraId: l.vendedora_id,
      nome: l.nome,
      quantidade: Number(l.quantidade),
      valor: Number(l.valor),
    }));
  }
}

/**
 * O agregado do Postgres chega como string.
 *
 * `receitaFechada` vira `null` quando e igual a `receita` — nao houve corte,
 * e devolver o mesmo numero duas vezes faria quem le achar que ha dois dados.
 */
function paraComparacao(l: {
  ano: string;
  receita: string;
  quantidade: string;
  receita_fechada: string;
}): ComparacaoAnual {
  const receita = Math.round(Number(l.receita));
  const fechada = Math.round(Number(l.receita_fechada));
  return {
    ano: Number(l.ano),
    receita,
    quantidade: Number(l.quantidade),
    receitaFechada: fechada === receita ? null : fechada,
  };
}
