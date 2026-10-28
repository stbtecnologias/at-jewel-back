import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  STATUS_DE_MOVIMENTACAO,
  formaPagamentoDe,
} from '../../../shared/database/sql/movimentacao-como-venda';
import type { Relatorio } from '../domain/relatorio';
import { TETO_DE_LISTA } from '../../../shared/limites/teto-de-lista';
import { agora } from './relatorio-de-produtos.use-case';
import { moeda } from '../../../shared/formato/moeda';

// DOIS MIL ERA O TETO PROPRIO DESTE RELATORIO, e virou o da casa em
// 28/10/2026: o painel nao tem por que caber menos que o WhatsApp. Ver
// `shared/limites/teto-de-lista`.
const TETO_DE_LINHAS = TETO_DE_LISTA;

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
      posicao: `Posição em ${agora()}`,
      // SETE COLUNAS NÃO CABEM EM PÉ — ver o comentário no renderizador.
      paisagem: true,
      colunas: [
        // A DATA CORTAVA O ANO AQUI TAMBÉM — 28/10/2026.
        //
        // O conserto de 27/10 ("11/08/2…") foi feito na tabela da agente e
        // NÃO chegou a este relatório do painel, que tinha o mesmo peso 0.8:
        // 33,3pt úteis para uma data que pede 48. Agora 1.05.
        { chave: 'data', titulo: 'Data', peso: 1.05, mono: true },
        { chave: 'cliente', titulo: 'Cliente', peso: 2.2 },
        { chave: 'pecas', titulo: 'Peças', peso: 3.5 },
        { chave: 'vendedora', titulo: 'Vendedora', peso: 1.5 },
        { chave: 'pagamento', titulo: 'Pagamento', peso: 1.3 },
        { chave: 'status', titulo: 'Status', peso: 1 },
        {
          // E o valor, pelo centavo: 51,8pt para um número que pede 76,8.
          // Os 0,7 que a data e o valor ganharam saem das peças (4.2 -> 3.5),
          // que seguem sendo a coluna mais larga da tabela.
          chave: 'valor',
          titulo: 'Total',
          peso: 1.55,
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
