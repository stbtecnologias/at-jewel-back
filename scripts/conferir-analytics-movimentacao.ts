/**
 * O ANALYTICS E A TELA DE VENDAS DAO O MESMO NUMERO? — 01/10/2026.
 *
 * ==========================================================================
 * A MESMA PERGUNTA POR DOIS CAMINHOS.
 *
 * `GET /analytics/resumo` e `GET /vendas/resumo` respondem a mesma coisa —
 * receita, numero de vendas, ticket — por repositorios diferentes. Em 25/09
 * essa divergencia custou uma correcao: R$ 1.213.806,50 na tela contra
 * R$ 934.126,50 no WhatsApp, para o mesmo agosto.
 *
 * Os specs provam o TEXTO do SQL. Isto aqui roda o SQL das classes de verdade
 * contra o banco de verdade e compara os numeros. Nenhuma consulta e reescrita
 * aqui: as classes sao instanciadas com um DataSource falso que repassa para o
 * `pg`, entao o que roda e exatamente o que a API roda.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-analytics-movimentacao.ts
 *
 * Nao escreve nada. So SELECT.
 */
import 'dotenv/config';
import { Client } from 'pg';
import type { DataSource } from 'typeorm';
import { AnalyticsDeMovimentacaoRepository } from '../src/modules/analytics/infrastructure/database/typeorm/repositories/analytics-de-movimentacao.repository';
import { AnalyticsRepository } from '../src/modules/analytics/infrastructure/database/typeorm/repositories/analytics.repository';
import { VendasDeMovimentacaoRepository } from '../src/modules/vendas/infrastructure/database/typeorm/repositories/vendas-de-movimentacao.repository';

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const vermelho = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function main() {
  const cliente = new Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();

  // O DataSource falso: repassa a consulta das classes para o `pg`.
  const ds = {
    query: async (sql: string, params?: unknown[]) =>
      (await cliente.query(sql, params as never[])).rows,
  } as unknown as DataSource;

  const analytics = new AnalyticsDeMovimentacaoRepository(
    ds,
    new AnalyticsRepository(ds),
  );
  const vendas = new VendasDeMovimentacaoRepository(ds);

  let divergencias = 0;
  const conferir = (titulo: string, a: number, b: number, formatar = brl) => {
    const bate = Math.abs(a - b) < 0.01;
    if (!bate) divergencias += 1;
    console.log(
      `  ${bate ? verde('bate   ') : vermelho('DIVERGE')}  ${titulo.padEnd(34)}` +
        ` analytics ${formatar(a).padStart(18)}   vendas ${formatar(b).padStart(18)}`,
    );
  };

  console.log('\n  RECONCILIACAO — analytics x tela de vendas\n');

  // ---- 1. o periodo inteiro ---------------------------------------------
  const resumoA = await analytics.resumoPeriodo();
  const resumoV = await vendas.resumoAgregado({});
  conferir('receita (tudo)', resumoA.receita, resumoV.receitaTotal);
  conferir('vendas (tudo)', resumoA.totalVendas, resumoV.totalVendas, (n) =>
    String(n),
  );
  conferir('ticket medio (tudo)', resumoA.ticketMedio, resumoV.ticketMedio);

  // ---- 2. um recorte de periodo ----------------------------------------
  const de = new Date('2026-08-01T00:00:00-03:00');
  const ate = new Date('2026-08-31T23:59:59-03:00');
  const recorteA = await analytics.resumoPeriodo({ dataInicio: de, dataFim: ate });
  const recorteV = await vendas.resumoAgregado({ dataDe: de, dataAte: ate });
  conferir('receita (agosto/2026)', recorteA.receita, recorteV.receitaTotal);
  conferir('vendas (agosto/2026)', recorteA.totalVendas, recorteV.totalVendas, (n) =>
    String(n),
  );

  // ---- 3. a serie mensal, mes a mes ------------------------------------
  const mensalA = await analytics.receitaMensal({ de, ate });
  const mensalV = await vendas.serieMensal({}, { de, ate });
  const mesA = mensalA.meses.find((m) => m.mes === '2026-08');
  const mesV = mensalV.meses.find((m) => m.mes === '2026-08');
  conferir('serie mensal (agosto/2026)', mesA?.receita ?? 0, mesV?.receita ?? 0);
  conferir(
    'serie: vendas do mes',
    mesA?.totalVendas ?? 0,
    mesV?.totalVendas ?? 0,
    (n) => String(n),
  );

  // ---- 4. o que acende, para olhar ------------------------------------
  const mensalTudo = await analytics.receitaMensal({
    de: new Date('2023-01-01T00:00:00-03:00'),
    ate: new Date(),
  });
  const comDado = mensalTudo.meses.filter((m) => m.receita !== 0).length;
  const top = await analytics.topProdutos(5);
  const pagamento = await analytics.distribuicaoPagamento();
  const somaPagamento = pagamento.reduce((s, p) => s + p.valor, 0);

  console.log('');
  console.log(`  meses com receita           ${comDado} de ${mensalTudo.meses.length}`);
  console.log(`  meta global ativa           ${brl(mensalTudo.meta)}`);
  console.log(`  top produtos                ${top.length} linha(s)`);
  console.log(
    `  desconto no top             ${brl(top.reduce((s, p) => s + p.descontoTotal, 0))}` +
      '   (zero e o valor certo: a loja nao registra desconto em linha)',
  );
  console.log(`  formas de pagamento         ${pagamento.length}`);
  console.log(
    `  valor coberto por parcela   ${brl(somaPagamento)} de ${brl(resumoA.receita)}` +
      `   (${((somaPagamento / resumoA.receita) * 100).toFixed(0)}% — ingestao incompleta)`,
  );

  const csv = await analytics.linhasVendaCsv();
  console.log(`  linhas do CSV               ${csv.length}`);

  const inventario = await analytics.estatisticasInventario();
  console.log(
    `  inventario (delegado)       ${inventario.total} pecas, ${brl(inventario.valorTotal)}`,
  );
  const giro = await analytics.giroEstoquePorFamilia();
  console.log(
    `  giro por familia (delegado) ${giro.length} linha(s)` +
      '   (0 esperado: data_entrada_estoque vazia em 7.196 pecas)',
  );

  console.log('');
  console.log(
    divergencias === 0
      ? verde('  OK — nenhuma divergencia entre o Analytics e a tela de Vendas.\n')
      : vermelho(`  ${divergencias} DIVERGENCIA(S). A mesma pergunta responde diferente.\n`),
  );

  await cliente.end();
  process.exit(divergencias === 0 ? 0 : 1);
}

void main();
