/**
 * O MODELO DE RESPOSTA DA LISTAGEM DE VENDAS, CONTRA O BANCO — 23/10/2026.
 *
 * ==========================================================================
 * A PERGUNTA DELE: *"quando pedir vendas, pode ser nesse modelo de
 * resposta?"* — com DATA, CLIENTE, VENDEDOR(A), as PEÇAS com código e valor,
 * o VALOR TOTAL e a FORMA DE PAGAMENTO.
 *
 * Três das sete linhas desse modelo não existem hoje na consulta: o CÓDIGO da
 * peça, a FORMA DE PAGAMENTO e o tamanho que o cartão ocupa na conversa.
 * Antes de prometer o formato, é preciso saber se o dado está lá — prometer e
 * descobrir depois que a linha vem vazia é pior que não ter prometido.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-listagem-de-vendas.ts
 *
 * Só SELECT. Nenhum nome de cliente é impresso.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

const pct = (parte: number, todo: number) =>
  todo === 0 ? '—' : `${Math.round((parte / todo) * 100)}%`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const ds = app.get(DataSource);

  const uma = async <T>(sql: string): Promise<T> =>
    (await ds.query<T[]>(sql))[0];

  console.log('\n=== AS ÚLTIMAS 200 VENDAS ===\n');

  const base = await uma<{
    vendas: string;
    com_cliente: string;
    com_vendedora: string;
    com_item: string;
  }>(`
    WITH ultimas AS (
      SELECT m.* FROM movimentacoes m
       WHERE m.ativo AND NOT m.entrada
       ORDER BY m.data_movimentacao DESC LIMIT 200
    )
    SELECT count(*)                                              AS vendas,
           count(*) FILTER (WHERE cliente_id IS NOT NULL)        AS com_cliente,
           count(*) FILTER (WHERE vendedora_id IS NOT NULL)      AS com_vendedora,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM movimentacoes_itens i
              WHERE i.movimentacao_id = ultimas.id AND i.ativo)) AS com_item
      FROM ultimas
  `);
  const n = Number(base.vendas);
  console.log(`  vendas                 ${n}`);
  console.log(`  com cliente            ${base.com_cliente} (${pct(Number(base.com_cliente), n)})`);
  console.log(`  com vendedora          ${base.com_vendedora} (${pct(Number(base.com_vendedora), n)})`);
  console.log(`  com pelo menos 1 item  ${base.com_item} (${pct(Number(base.com_item), n)})`);

  console.log('\n=== O CÓDIGO DA PEÇA (a linha "BR21639 BRINCOS…") ===\n');

  const itens = await uma<{
    itens: string;
    com_produto: string;
    com_codigo: string;
    com_descricao: string;
  }>(`
    WITH ultimas AS (
      SELECT m.id FROM movimentacoes m
       WHERE m.ativo AND NOT m.entrada
       ORDER BY m.data_movimentacao DESC LIMIT 200
    )
    SELECT count(*)                                                  AS itens,
           count(p.id)                                               AS com_produto,
           count(*) FILTER (WHERE NULLIF(p.codigo_erp, '') IS NOT NULL)        AS com_codigo,
           count(*) FILTER (WHERE NULLIF(p.descricao_etiqueta, '') IS NOT NULL) AS com_descricao
      FROM movimentacoes_itens i
      JOIN ultimas u ON u.id = i.movimentacao_id
      LEFT JOIN produtos p ON p.id = i.produto_id
     WHERE i.ativo
  `);
  const ni = Number(itens.itens);
  console.log(`  itens                  ${ni}`);
  console.log(`  com peça no cadastro   ${itens.com_produto} (${pct(Number(itens.com_produto), ni)})`);
  console.log(`  com CÓDIGO             ${itens.com_codigo} (${pct(Number(itens.com_codigo), ni)})`);
  console.log(`  com descrição          ${itens.com_descricao} (${pct(Number(itens.com_descricao), ni)})`);

  console.log('\n=== QUANTAS PEÇAS POR VENDA (o tamanho do cartão) ===\n');

  const porVenda = await ds.query<{ pecas: string; vendas: string }[]>(`
    WITH ultimas AS (
      SELECT m.id FROM movimentacoes m
       WHERE m.ativo AND NOT m.entrada
       ORDER BY m.data_movimentacao DESC LIMIT 200
    ), contagem AS (
      SELECT u.id, count(i.id) AS pecas
        FROM ultimas u
        LEFT JOIN movimentacoes_itens i ON i.movimentacao_id = u.id AND i.ativo
       GROUP BY u.id
    )
    SELECT CASE WHEN pecas > 5 THEN '6+' ELSE pecas::text END AS pecas,
           count(*) AS vendas
      FROM contagem GROUP BY 1 ORDER BY 1
  `);
  for (const l of porVenda) {
    console.log(`  ${l.pecas.padStart(3)} peça(s)            ${l.vendas} vendas`);
  }

  console.log('\n=== A FORMA DE PAGAMENTO (a última linha do modelo) ===\n');

  const pag = await uma<{
    vendas: string;
    com_pagamento: string;
    com_forma: string;
    mais_de_uma_forma: string;
  }>(`
    WITH ultimas AS (
      SELECT m.id FROM movimentacoes m
       WHERE m.ativo AND NOT m.entrada
       ORDER BY m.data_movimentacao DESC LIMIT 200
    ), formas AS (
      SELECT u.id,
             count(mp.id)                                       AS pagamentos,
             count(DISTINCT COALESCE(mp.forma_pagamento_id,
                                     mp.forma_pagamento_id_erp::uuid)) AS formas
        FROM ultimas u
        LEFT JOIN movimentacoes_pagamentos mp ON mp.movimentacao_id = u.id
       GROUP BY u.id
    )
    SELECT count(*)                                   AS vendas,
           count(*) FILTER (WHERE pagamentos > 0)     AS com_pagamento,
           count(*) FILTER (WHERE formas > 0)         AS com_forma,
           count(*) FILTER (WHERE formas > 1)         AS mais_de_uma_forma
      FROM formas
  `);
  const nv = Number(pag.vendas);
  console.log(`  vendas                 ${nv}`);
  console.log(`  com linha de pagamento ${pag.com_pagamento} (${pct(Number(pag.com_pagamento), nv)})`);
  console.log(`  com FORMA identificada ${pag.com_forma} (${pct(Number(pag.com_forma), nv)})`);
  console.log(`  com MAIS DE UMA forma  ${pag.mais_de_uma_forma} (${pct(Number(pag.mais_de_uma_forma), nv)})`);

  const nomes = await ds.query<{ forma: string; vezes: string }[]>(`
    WITH ultimas AS (
      SELECT m.id FROM movimentacoes m
       WHERE m.ativo AND NOT m.entrada
       ORDER BY m.data_movimentacao DESC LIMIT 200
    )
    SELECT COALESCE(f.nome, '(sem forma)') AS forma, count(*) AS vezes
      FROM ultimas u
      JOIN movimentacoes_pagamentos mp ON mp.movimentacao_id = u.id
      LEFT JOIN formas_pagamento f
             ON f.id = COALESCE(mp.forma_pagamento_id, mp.forma_pagamento_id_erp::uuid)
     GROUP BY 1 ORDER BY 2 DESC LIMIT 12
  `);
  console.log('\n  as formas que aparecem:');
  for (const l of nomes) {
    console.log(`    ${String(l.vezes).padStart(4)}x  ${l.forma}`);
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
