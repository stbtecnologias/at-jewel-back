import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Relatorio } from '../domain/relatorio';

/** O teto de linhas de um relatório. Ver o comentário no `execute`. */
const TETO_DE_LINHAS = 2000;

interface LinhaSql {
  codigo_erp: string | null;
  descricao: string | null;
  categoria: string | null;
  empresa: string | null;
  qtd: string;
  valor: string;
}

/**
 * A LISTA DE PRODUTOS — RF36 e RF37, 21/10/2026.
 *
 * ==========================================================================
 * É O PRIMEIRO CONTEÚDO DO MOLDE, E FOI ESCOLHIDO POR ISSO.
 *
 * Dos três que o Lucas pediu — produtos, vendas e vendedoras —, este é o que
 * sai INTEIRO do banco hoje: código, descrição, categoria, empresa, saldo e
 * valor, sem nenhum campo que dependa de ligação quebrada. Serve de prova do
 * molde sem misturar o defeito de um dado com o defeito de um desenho.
 * ==========================================================================
 *
 * O SALDO VEM DA TABELA `estoque`, e nunca de `produtos.estoque_atual`, que
 * está zerada — é a mesma regra de todo o resto do sistema desde 25/08.
 */
@Injectable()
export class RelatorioDeProdutosUseCase {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async execute(opcoes?: {
    categoria?: string;
    geradoPor?: string;
  }): Promise<Relatorio> {
    const params: unknown[] = [];
    let filtroCategoria = '';
    if (opcoes?.categoria) {
      params.push(opcoes.categoria.toUpperCase());
      filtroCategoria = `AND p.categoria = $${params.length}`;
    }

    const linhas = await this.ds.query<LinhaSql[]>(
      `
      SELECT p.codigo_erp,
             COALESCE(NULLIF(btrim(p.descricao_etiqueta), ''),
                      p.categoria || ' ' || p.familia) AS descricao,
             p.categoria,
             e.nome                                    AS empresa,
             SUM(es.quantidade)::int                   AS qtd,
             p.valor_venda                             AS valor
        FROM produtos p
        JOIN estoque es   ON es.produto_id = p.id AND es.quantidade > 0
        LEFT JOIN empresas e ON e.id = es.empresa_id
       WHERE p.ativo ${filtroCategoria}
       GROUP BY p.id, p.codigo_erp, p.descricao_etiqueta, p.categoria,
                p.familia, e.nome, p.valor_venda
       ORDER BY p.valor_venda DESC NULLS LAST
      `,
      params,
    );

    // ======================================================================
    // O RECORTE QUE ESCONDE DIZ QUE ESCONDEU — a mesma regra da régua e das
    // fotos da peça. Um relatório de 2.000 linhas já é grande demais para
    // qualquer uso humano; o que não pode é ele PARECER completo.
    // ======================================================================
    const mostradas = linhas.slice(0, TETO_DE_LINHAS);

    const totalQtd = linhas.reduce((n, l) => n + Number(l.qtd), 0);
    const totalValor = linhas.reduce(
      (n, l) => n + Number(l.valor ?? 0) * Number(l.qtd),
      0,
    );

    // A CONTAGEM DE FOTO É DA COLUNA, E A FRASE DIZ ISSO.
    //
    // Medido em 20/10: 247 peças com URL e **55 com foto de verdade** na
    // Conexa. Um cartão dizendo "com foto" sem o "cadastrada" prometeria
    // quatro vezes mais do que existe — e é o aviso que o RF32 carrega.
    const [foto] = await this.ds.query<{ com: string; total: string }[]>(
      `SELECT COUNT(*) FILTER (
                WHERE p.foto_arquivo_id IS NOT NULL
                   OR NULLIF(btrim(p.foto_url), '') IS NOT NULL) AS com,
              COUNT(*) AS total
         FROM produtos p WHERE p.ativo`,
    );

    return {
      titulo: 'Lista de Produtos',
      posicao: `Posição em ${agora()}`,
      colunas: [
        { chave: 'codigo', titulo: 'Código', peso: 1.1, mono: true },
        { chave: 'descricao', titulo: 'Descrição', peso: 3.4 },
        { chave: 'categoria', titulo: 'Categoria', peso: 1.1 },
        { chave: 'empresa', titulo: 'Empresa', peso: 1.3 },
        {
          chave: 'qtd',
          titulo: 'Qtd',
          peso: 0.5,
          alinhamento: 'direita',
          mono: true,
        },
        {
          chave: 'valor',
          titulo: 'Valor',
          peso: 1.2,
          alinhamento: 'direita',
          mono: true,
        },
      ],
      linhas: mostradas.map((l) => ({
        codigo: l.codigo_erp ?? '—',
        descricao: l.descricao ?? '—',
        categoria: l.categoria ?? '—',
        empresa: l.empresa ?? '—',
        qtd: String(l.qtd),
        valor: moeda(Number(l.valor ?? 0)),
      })),
      total: {
        codigo: 'Total',
        qtd: String(totalQtd),
        valor: moeda(totalValor),
      },
      exibindo:
        mostradas.length < linhas.length
          ? { mostradas: mostradas.length, total: linhas.length }
          : undefined,
      nota: 'Valores unitários de tabela. Quantidades refletem o saldo informado pelo ERP na última sincronização.',
      geradoPor: opcoes?.geradoPor,
    };
  }
}

export function moeda(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

export function agora(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
