import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  STATUS_DE_MOVIMENTACAO,
  formaPagamentoDe,
} from '../../../shared/database/sql/movimentacao-como-venda';
import type { Relatorio } from '../domain/relatorio';
import { agora, moeda } from './relatorio-de-produtos.use-case';

const TETO_DE_LINHAS = 2000;

interface LinhaSql {
  data: Date;
  cliente: string | null;
  vendedora: string | null;
  pecas: string | null;
  formas: string | null;
  status: string;
  valor: string;
}

/**
 * A LISTAGEM DE VENDAS — RF36 e RF37, 21/10/2026.
 *
 * ==========================================================================
 * O FORMATO É O QUE O LUCAS DESENHOU, com uma correção que a base impôs.
 *
 * O modelo dele era um bloco por venda — data, cliente, vendedora, peças,
 * total, forma de pagamento. Num PDF isso vira UMA LINHA por venda, com as
 * peças juntas numa célula: bloco é formato de conversa, tabela é formato de
 * relatório, e os dois dizem a mesma coisa.
 *
 * Medido em 21/10: um bloco são 220 caracteres e 7 linhas; o dia mais
 * movimentado tem 27 vendas e daria 5.990 caracteres — que raspa o teto de
 * resposta da agente. Em tabela, cabe numa página.
 * ==========================================================================
 *
 * A FORMA DE PAGAMENTO SAI, e eu disse o contrário antes de conferir: a
 * ligação é `movimentacoes_pagamentos -> formas_pagamento.id`, e não pelo
 * `id_erp` — o UUID guardado na coluna `forma_pagamento_id_erp` é o NOSSO id.
 * Resolve 1.750 de 1.750 pagamentos; as movimentações sem forma são as 151
 * que não têm pagamento nenhum registrado.
 */
@Injectable()
export class RelatorioDeVendasUseCase {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async execute(opcoes?: {
    de?: Date;
    ate?: Date;
    geradoPor?: string;
  }): Promise<Relatorio> {
    const params: unknown[] = [];
    let janela = '';
    if (opcoes?.de && opcoes?.ate) {
      params.push(opcoes.de, opcoes.ate);
      janela = `AND m.data_movimentacao >= $1 AND m.data_movimentacao < $2`;
    }

    const linhas = await this.ds.query<LinhaSql[]>(
      `
      SELECT m.data_movimentacao                       AS data,
             cl.nome                                   AS cliente,
             vd.nome                                   AS vendedora,
             (SELECT string_agg(
                       COALESCE(p.codigo_erp, '?') || ' ' ||
                       COALESCE(NULLIF(btrim(p.descricao_etiqueta), ''), p.categoria),
                       ' · ' ORDER BY i.n_item)
                FROM movimentacoes_itens i
                LEFT JOIN produtos p ON p.id = i.produto_id
               WHERE i.movimentacao_id = m.id)         AS pecas,
             (SELECT string_agg(DISTINCT fp.nome, ', ')
                FROM movimentacoes_pagamentos mp
                JOIN formas_pagamento fp ON fp.id = ${formaPagamentoDe('mp')}
               WHERE mp.movimentacao_id = m.id)        AS formas,
             ${STATUS_DE_MOVIMENTACAO}                 AS status,
             m.valor                                   AS valor
        FROM movimentacoes m
        LEFT JOIN clientes cl   ON cl.id = m.cliente_id
        LEFT JOIN vendedoras vd ON vd.id = m.vendedora_id
       WHERE m.ativo ${janela}
       ORDER BY m.data_movimentacao DESC
      `,
      params,
    );

    const mostradas = linhas.slice(0, TETO_DE_LINHAS);

    // A RECEITA DESCONTA DEVOLUÇÃO; A CONTAGEM NÃO.
    //
    // É a regra da casa desde 01/10, e ela existe para o número da tela ser
    // reconciliável: 20 vendas e 6 devoluções continuam sendo 20 vendas.
    const receita = linhas.reduce(
      (n, l) => n + (l.status === 'devolvida' ? -1 : 1) * Number(l.valor ?? 0),
      0,
    );
    const devolvidas = linhas.filter((l) => l.status === 'devolvida').length;
    const semForma = linhas.filter((l) => !l.formas).length;

    return {
      titulo: 'Listagem de Vendas',
      subtitulo:
        'Vendas e devoluções sincronizadas do ERP, da mais recente para a mais antiga.',
      posicao: `Posição em ${agora()}`,
      // SETE COLUNAS NÃO CABEM EM PÉ — ver o comentário no renderizador.
      paisagem: true,
      filtros: [
        {
          rotulo: 'Período',
          valor:
            opcoes?.de && opcoes?.ate
              ? `${dia(opcoes.de)} a ${dia(opcoes.ate)}`
              : 'Tudo',
        },
        { rotulo: 'Ordem', valor: 'Mais recente primeiro' },
      ],
      colunas: [
        { chave: 'data', titulo: 'Data', peso: 0.8, mono: true },
        { chave: 'cliente', titulo: 'Cliente', peso: 2.2 },
        { chave: 'pecas', titulo: 'Peças', peso: 4.2 },
        { chave: 'vendedora', titulo: 'Vendedora', peso: 1.5 },
        { chave: 'pagamento', titulo: 'Pagamento', peso: 1.3 },
        { chave: 'status', titulo: 'Status', peso: 1 },
        {
          chave: 'valor',
          titulo: 'Total',
          peso: 1.1,
          alinhamento: 'direita',
          mono: true,
        },
      ],
      linhas: mostradas.map((l) => ({
        data: dia(l.data),
        cliente: l.cliente ?? '—',
        pecas: l.pecas ?? '—',
        vendedora: l.vendedora ?? '—',
        // O TRAÇO É A RESPOSTA HONESTA, e não um vazio: 151 movimentações não
        // têm pagamento nenhum registrado, e a tela de Vendas já mostra assim.
        pagamento: l.formas ?? '—',
        status: cap(l.status),
        valor: moeda(Number(l.valor ?? 0)),
      })),
      total: { data: 'Total', valor: moeda(receita) },
      exibindo:
        mostradas.length < linhas.length
          ? { mostradas: mostradas.length, total: linhas.length }
          : undefined,
      nota: 'Receita desconta devoluções; a contagem de documentos, não. Valores conforme o ERP na última sincronização.',
      geradoPor: opcoes?.geradoPor,
    };
  }
}

function dia(d: Date | string): string {
  return new Date(d).toLocaleDateString('pt-BR');
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
