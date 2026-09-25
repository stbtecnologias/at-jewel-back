import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  IVendasMovimentacaoRepository,
  ItemMaisVendido,
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
       GROUP BY p.id, p.codigo_erp, p.descricao_etiqueta, p.familia
       ORDER BY valor DESC
       LIMIT $3
      `,
      [janela.de, janela.ate, limite, vendedoraId ?? null],
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
}
