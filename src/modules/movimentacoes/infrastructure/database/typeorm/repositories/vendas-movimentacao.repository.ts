import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
// A REGRA DA RECEITA VEM DO SHARED. A quebra por empresa nasceu em 02/10,
// quando o fragmento ja existia; as consultas antigas deste arquivo seguem
// com a condicao escrita a mao, e sao de 25/09.
import {
  devolucaoEfetiva,
  receitaLiquida,
  vendaEfetiva,
} from '../../../../../../shared/database/sql/movimentacao-como-venda';
import type {
  ComparacaoAnual,
  FiltroVendasDetalhadas,
  IVendasMovimentacaoRepository,
  ItemDaVenda,
  VendasDeUmaEmpresa,
  VendaDetalhada,
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

  /**
   * AS VENDAS, UMA A UMA — 02/10/2026.
   *
   * ======================================================================
   * A AGENTE SABIA O TOTAL E NAO SABIA QUAIS ERAM.
   *
   * "Em setembro o Marco Abreu fez 2 vendas, R$ 217.520" — e, perguntada
   * quem comprou, nao tinha o que responder. Todas as consultas de venda
   * eram agregadas; faltava a linha.
   * ======================================================================
   *
   * AS PECAS VEM NA MESMA VARREDURA, por subconsulta. Medido: 1,6 peca por
   * venda na media, 13 no maximo — listar as pecas de dez vendas da umas
   * dezesseis linhas. Uma segunda pergunta ("e o que ela comprou?") seria
   * atrito a cada consulta, para economizar o que cabe.
   *
   * CANCELADA FICA DE FORA: nao e compra. A DEVOLUCAO entra, marcada — no
   * historico de um cliente, ela e informacao e nao ruido.
   */
  async listarDetalhadas(
    filtro: FiltroVendasDetalhadas,
    limite: number,
  ): Promise<{ vendas: VendaDetalhada[]; total: number }> {
    const params: unknown[] = [];
    const conds: string[] = ['m.ativo'];

    if (filtro.janela) {
      params.push(filtro.janela.de, filtro.janela.ate);
      conds.push(`m.data_movimentacao BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    if (filtro.clienteId) {
      params.push(filtro.clienteId);
      conds.push(`m.cliente_id = $${params.length}`);
    }
    if (filtro.vendedoraId) {
      params.push(filtro.vendedoraId);
      conds.push(`m.vendedora_id = $${params.length}`);
    }
    if (filtro.documento) {
      // O numero vem como a pessoa fala dele ("1157", "a 1.157"). So digito.
      params.push(filtro.documento.replace(/\D/g, ''));
      conds.push(`m.numero = $${params.length}`);
    }
    params.push(limite);

    const linhas = await this.ds.query<
      {
        documento: string | null;
        data: Date;
        cliente_codigo: string | null;
        cliente: string | null;
        vendedora: string | null;
        valor: string;
        status: string;
        itens: ItemDaVenda[] | null;
        total: string;
      }[]
    >(
      `
      SELECT m.numero                        AS documento,
             m.data_movimentacao             AS data,
             c.codigo_erp                    AS cliente_codigo,
             c.nome                          AS cliente,
             v.nome                          AS vendedora,
             m.valor                         AS valor,
             CASE WHEN m.entrada THEN 'devolvida' ELSE 'concluida' END AS status,
             -- NUMERO AQUI, TEXTO LA. Ver o comentario em ItemDaVenda.
             (SELECT jsonb_agg(
                       jsonb_build_object(
                         'quantidade', i.quantidade::float,
                         'nome', COALESCE(NULLIF(p.descricao_etiqueta, ''), p.codigo_erp, 'peça sem descrição'),
                         'valor', (i.quantidade * i.valor_unitario)::float)
                       ORDER BY i.quantidade * i.valor_unitario DESC)
                FROM movimentacoes_itens i
                LEFT JOIN produtos p ON p.id = i.produto_id
               WHERE i.movimentacao_id = m.id AND i.ativo) AS itens,
             count(*) OVER ()                AS total
      FROM movimentacoes m
      LEFT JOIN clientes   c ON c.id = m.cliente_id
      LEFT JOIN vendedoras v ON v.id = m.vendedora_id
      WHERE ${conds.join(' AND ')}
      ORDER BY m.data_movimentacao DESC
      LIMIT $${params.length}
      `,
      params,
    );

    return {
      vendas: linhas.map((l) => ({
        documento: l.documento,
        data: l.data,
        clienteCodigo: l.cliente_codigo,
        cliente: l.cliente,
        vendedora: l.vendedora,
        valor: Number(l.valor),
        status: l.status,
        itens: l.itens ?? [],
      })),
      total: Number(linhas[0]?.total ?? 0),
    };
  }

  /**
   * A QUEBRA POR EMPRESA — 02/10/2026.
   *
   * ======================================================================
   * A COLUNA EXISTIA E NINGUEM OLHAVA.
   *
   * Perguntada pelo faturamento da MP Comercio, a agente procurou "MP" na
   * lista de CLIENTES — porque empresa nao existia para ferramenta nenhuma.
   * Todo numero que a gestao ve e, ate aqui, a soma dos CNPJs do grupo.
   * ======================================================================
   *
   * A CONTAGEM e so das vendas; a RECEITA abate a devolucao, como em todo o
   * resto. Empresa que so teve devolucao no recorte aparece com receita
   * negativa — e foi o que aconteceu de verdade naquele periodo.
   */
  async receitaPorEmpresa(janela?: JanelaDeVendas): Promise<VendasDeUmaEmpresa[]> {
    const params: unknown[] = [];
    let periodo = '';
    if (janela) {
      params.push(janela.de, janela.ate);
      periodo = `AND m.data_movimentacao BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    const linhas = await this.ds.query<
      { empresa: string; vendas: string; receita: string; devolucoes: string }[]
    >(
      `
      SELECT e.nome                                          AS empresa,
             count(*) FILTER (WHERE ${vendaEfetiva('m')})     AS vendas,
             ${receitaLiquida('m')}                          AS receita,
             count(*) FILTER (WHERE ${devolucaoEfetiva('m')}) AS devolucoes
      FROM movimentacoes m
      JOIN empresas e ON e.id = m.empresa_id
      WHERE m.ativo ${periodo}
      GROUP BY e.nome
      ORDER BY receita DESC
      `,
      params,
    );

    return linhas.map((l) => ({
      empresa: l.empresa,
      vendas: Number(l.vendas),
      receita: Number(l.receita),
      devolucoes: Number(l.devolucoes),
    }));
  }

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
        clientes: string;
      }[]
    >(
      `
      SELECT
        count(*) FILTER (WHERE m.saida)                       AS quantidade,
        COALESCE(sum(m.valor) FILTER (WHERE m.saida), 0)      AS valor_vendas,
        count(*) FILTER (WHERE m.entrada)                     AS devolucoes,
        COALESCE(sum(m.valor) FILTER (WHERE m.entrada), 0)    AS valor_devolvido,
        -- CLIENTES DISTINTOS, na mesma varredura: quem comprou tres vezes
        -- conta 1 aqui e 3 na quantidade, e as duas perguntas existem.
        count(DISTINCT m.cliente_id) FILTER (WHERE m.saida)   AS clientes
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
      clientes: Number(linha?.clientes ?? 0),
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
        pecas: string;
        devolvidas: string;
        valor_devolvido: string;
        familias: { familia: string; quantidade: number }[] | null;
        familias_devolvidas: { familia: string; quantidade: number }[] | null;
      }[]
    >(
      `
      SELECT v.id                                                AS vendedora_id,
             v.nome                                              AS nome,
             v.codigo_erp                                        AS codigo_erp,
             count(*) FILTER (WHERE m.saida)                     AS quantidade,
             COALESCE(sum(m.valor) FILTER (WHERE m.saida), 0)
               - COALESCE(sum(m.valor) FILTER (WHERE m.entrada), 0) AS valor,
             -- AS PECAS SAO AS VENDIDAS, e o que voltou vem ao lado em vez de
             -- abater (02/10/2026). Abatendo, a Ylka era "2 vendas, 0 pecas":
             -- ela vendeu duas, e as duas que voltaram eram de outro mes.
             COALESCE(sum(qi.qtd) FILTER (WHERE m.saida), 0)       AS pecas,
             COALESCE(sum(qi.qtd) FILTER (WHERE m.entrada), 0)     AS devolvidas,
             COALESCE(sum(m.valor) FILTER (WHERE m.entrada), 0)    AS valor_devolvido,
             -- A QUEBRA POR TIPO, numa subconsulta por vendedora (02/10/2026).
             -- Agrupar por familia no mesmo GROUP BY daria uma linha por tipo,
             -- e a vendedora apareceria varias vezes no ranking.
             --
             -- SO SAIDA AQUI, desde 02/10. Enquanto a quebra era liquida uma
             -- familia podia fechar NEGATIVA, e o teto de tipos do formatador
             -- escondia justamente ela: a Bianca saiu com "5 pecas" e quatro
             -- tipos somando 6. Separando venda de devolucao, familia negativa
             -- deixa de existir e a soma fecha por construcao.
             (SELECT jsonb_agg(
                       jsonb_build_object('familia', f.familia, 'quantidade', f.qtd)
                       ORDER BY f.qtd DESC)
                FROM (
                  SELECT COALESCE(NULLIF(p.familia, ''), 'sem tipo') AS familia,
                         sum(i.quantidade) AS qtd
                    FROM movimentacoes mm
                    JOIN movimentacoes_itens i ON i.movimentacao_id = mm.id AND i.ativo
                    LEFT JOIN produtos p ON p.id = i.produto_id
                   WHERE mm.vendedora_id = v.id
                     AND mm.ativo
                     AND mm.saida
                     AND mm.data_movimentacao >= $1
                     AND mm.data_movimentacao <= $2
                   GROUP BY 1
                ) f)                                               AS familias,
             -- A IRMA, do outro lado: o que VOLTOU, por tipo. Duas consultas
             -- em vez de uma assinada porque sao dois numeros na linha, e
             -- somar os dois num so foi justamente o que deu errado.
             (SELECT jsonb_agg(
                       jsonb_build_object('familia', f.familia, 'quantidade', f.qtd)
                       ORDER BY f.qtd DESC)
                FROM (
                  SELECT COALESCE(NULLIF(p.familia, ''), 'sem tipo') AS familia,
                         sum(i.quantidade) AS qtd
                    FROM movimentacoes mm
                    JOIN movimentacoes_itens i ON i.movimentacao_id = mm.id AND i.ativo
                    LEFT JOIN produtos p ON p.id = i.produto_id
                   WHERE mm.vendedora_id = v.id
                     AND mm.ativo
                     AND mm.entrada
                     AND mm.data_movimentacao >= $1
                     AND mm.data_movimentacao <= $2
                   GROUP BY 1
                ) f)                                               AS familias_devolvidas
        FROM movimentacoes m
        JOIN vendedoras v ON v.id = m.vendedora_id
        -- As pecas somadas POR FORA do agrupamento: contar item no mesmo
        -- GROUP BY multiplicaria a venda por linha de item.
        LEFT JOIN LATERAL (
          SELECT COALESCE(sum(i.quantidade), 0) AS qtd
            FROM movimentacoes_itens i
           WHERE i.movimentacao_id = m.id AND i.ativo
        ) qi ON TRUE
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
      pecas: Number(l.pecas),
      devolvidas: Number(l.devolvidas),
      valorDevolvido: Number(l.valor_devolvido),
      familias: (l.familias ?? []).map((f) => ({
        familia: f.familia,
        quantidade: Number(f.quantidade),
      })),
      familiasDevolvidas: (l.familias_devolvidas ?? []).map((f) => ({
        familia: f.familia,
        quantidade: Number(f.quantidade),
      })),
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
    // SO AS SAIDAS — mudou em 02/10/2026, e agora os tres rankings contam
    // igual (este, o `itensMaisVendidos` e as pecas do `rankingDeVendedoras`).
    //
    // ATE HOJE A DEVOLUCAO ABATIA AQUI, com o argumento de que "quem vendeu
    // dez e teve tres de volta vendeu sete". O argumento parece certo e
    // produzia linhas ilegiveis: perguntada quantos pingentes sairam em
    // setembro, a lista saiu
    //
    //     CAMILA BRITO:      6 pingentes
    //     YLKA FRANCK:       1 pingente
    //     KEYCIANE BARBOSA: -1 pingentes
    //
    // e a agente simplesmente APAGOU a terceira ao responder — "-1 pingente
    // vendido" nao tem leitura possivel numa pergunta sobre o que foi
    // vendido. O numero que ela deu (7) era o bruto; somando a lista como ela
    // veio, daria 6. A regua liquida fazia a resposta nao poder bater com a
    // lista que a produziu.
    //
    // A REGRA DO LUCAS, em 02/10: "se e vendas, nao entra devolucao; se
    // vendeu, ok". Quem so devolveu no recorte nao vendeu nada, entao nao
    // aparece num ranking de quem vendeu — e some por construcao, pelo filtro
    // `m.saida`, sem precisar de um HAVING para expulsar negativo.
    //
    // A DEVOLUCAO NAO FICA SEM DONO: ela e pergunta propria ("quantas
    // devolucoes esse mes"), e no panorama da equipe ela viaja ao lado da
    // vendedora. O que ela nao faz mais e se disfarcar de venda negativa.
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
             COALESCE(sum(i.quantidade), 0)                      AS quantidade,
             COALESCE(sum(i.quantidade * i.valor_unitario), 0)   AS valor
        FROM movimentacoes_itens i
        JOIN movimentacoes m ON m.id = i.movimentacao_id
        JOIN produtos p      ON p.id = i.produto_id
        JOIN vendedoras v    ON v.id = m.vendedora_id
       WHERE m.ativo
         AND i.ativo
         -- A LINHA QUE DEFINE A PERGUNTA. Ver o bloco acima.
         AND m.saida
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
    // SO AS SAIDAS, pelo mesmo motivo do `rankingPorFamilia` (02/10/2026).
    // O `HAVING > 0` que existia aqui ja dizia a verdade pela metade: ele
    // expulsava quem fechava negativo, mas quem vendia dez e devolvia tres
    // continuava contando sete num ranking chamado "quem mais vendeu". Com o
    // filtro `m.saida` o HAVING fica sem funcao — quem nao vendeu nao tem
    // linha para ser expulsa.
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
               COALESCE(sum(i.quantidade), 0)                    AS quantidade,
               COALESCE(sum(i.quantidade * i.valor_unitario), 0) AS valor
          FROM movimentacoes_itens i
          JOIN movimentacoes m ON m.id = i.movimentacao_id
          JOIN produtos p      ON p.id = i.produto_id
          JOIN vendedoras v    ON v.id = m.vendedora_id
         WHERE m.ativo
           AND i.ativo
           -- A LINHA QUE DEFINE A PERGUNTA. Ver o bloco acima.
           AND m.saida
           AND extract(month from m.data_movimentacao) = $1
           AND upper(p.familia) = upper($2::text)
         GROUP BY 1, 2, 3
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
