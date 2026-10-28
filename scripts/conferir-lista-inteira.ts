/**
 * POR QUE A LISTA PARA EM VINTE — 27/10/2026.
 *
 * ==========================================================================
 * *"Quero a lista de todos os clientes que a Ylka atendeu em 2025 e 2026"* —
 * e saem vinte registros. O pedido do Lucas: entender por que os outros nao
 * saem na conversa, e se caberiam.
 *
 * Este script mede as tres coisas de uma vez, contra o banco:
 *
 *   1. quantos clientes existem no recorte, e quantos o MODELO recebe;
 *   2. o tamanho da mensagem se ela levasse TODOS — em caracteres, contra o
 *      teto do WhatsApp e contra o teto de tokens da resposta;
 *   3. a instrucao exata que o modelo recebe junto da lista cortada.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-lista-inteira.ts Ylka
 *
 * So SELECT, e nao ocupa a porta 3000. Os nomes NAO saem no terminal: aqui o
 * que importa e o tamanho, e nao quem esta na lista.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FerramentasGestaoService } from '../src/modules/atendimentos/application/ferramentas-gestao.service';
import { UltimoRelatorioService } from '../src/modules/relatorios/application/ultimo-relatorio.service';
import { faixaDaLista } from '../src/modules/agentes/infrastructure/llm/anthropic.client';

/** Teto de saida da resposta nos dois canais — `processar-mensagem-*`. */
const TETO_DE_TOKENS = 1500;
/** Em portugues, com nome proprio e acento, a conta empirica fica por aqui. */
const CHARS_POR_TOKEN = 3.5;
/** O WhatsApp de consumidor, que e o que o WAHA fala. */
const TETO_WHATSAPP = 65536;
/** O teto da API oficial da Meta, para o dia em que a casa migrar. */
const TETO_META = 4096;

function barra(usado: number, teto: number): string {
  const p = Math.min(100, Math.round((usado / teto) * 100));
  return `${p}%`;
}

async function main() {
  const vendedora = process.argv[2] ?? 'Ylka';
  const de = process.argv[3] ?? '2025-01-01';
  const ate = process.argv[4] ?? '2026-12-31';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const ferramentas = app.get(FerramentasGestaoService);
  const ultimo = app.get(UltimoRelatorioService);

  const chave = 'conferencia:lista-inteira';
  const gestao = ferramentas.montar({
    chaveDaConversa: chave,
    solicitante: 'conferência',
    verLoja: true,
  });

  const r = await gestao.gestaoMelhores({ vendedora, de, ate });
  if (r.status !== 'OK') {
    console.log(`status: ${r.status} — ${(r.nomes ?? []).join(', ') || '—'}`);
    await app.close();
    return;
  }

  const tabela = ultimo.pegar(chave);
  const todas = tabela?.linhas ?? [];

  console.log(`\n=== ${vendedora}, de ${de} a ${ate} ===\n`);
  console.log(`clientes no recorte (o total que o SQL conta): ${r.total}`);
  console.log(`linhas que o MODELO recebe:                    ${r.linhas.length}`);
  console.log(`linhas guardadas para o ARQUIVO:               ${todas.length}`);
  console.log(
    `invisiveis ao modelo:                          ${(r.total ?? 0) - r.linhas.length}`,
  );

  // A MENSAGEM COMPLETA, montada como a agente monta: uma linha por cliente.
  const linhasInteiras = todas.map(
    (l) => `- ${l.cliente} — ${l.quantidade} compras, ${l.valor}`,
  );
  const mensagem =
    `Clientes atendidos pela ${vendedora} em 2025 e 2026 (${todas.length}):\n` +
    linhasInteiras.join('\n');

  const chars = mensagem.length;
  const tokens = Math.ceil(chars / CHARS_POR_TOKEN);

  console.log(`\n=== SE A MENSAGEM LEVASSE TODOS OS ${todas.length} ===\n`);
  console.log(`caracteres:            ${chars}`);
  console.log(`tokens (estimado):     ~${tokens}`);
  console.log(
    `contra o teto de ${TETO_DE_TOKENS} tokens da resposta: ${barra(tokens, TETO_DE_TOKENS)} ${
      tokens <= TETO_DE_TOKENS ? '— CABE' : '— NAO CABE'
    }`,
  );
  console.log(
    `contra o WhatsApp (${TETO_WHATSAPP} chars):          ${barra(chars, TETO_WHATSAPP)} ${
      chars <= TETO_WHATSAPP ? '— CABE' : '— NAO CABE'
    }`,
  );
  console.log(
    `contra a API da Meta (${TETO_META} chars):        ${barra(chars, TETO_META)} ${
      chars <= TETO_META ? '— CABE' : '— NAO CABE'
    }`,
  );
  console.log(`maior linha: ${Math.max(...linhasInteiras.map((l) => l.length))} chars`);

  console.log(`\n=== A INSTRUCAO QUE O MODELO RECEBE COM A LISTA CORTADA ===\n`);
  console.log(faixaDaLista(0, r.linhas.length, r.total, {}));

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
