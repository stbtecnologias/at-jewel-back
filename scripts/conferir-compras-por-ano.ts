/**
 * A TABELA DE COMPRAS POR CLIENTE E POR ANO, CONTRA O BANCO — 27/10/2026.
 *
 * ==========================================================================
 * O PEDIDO QUE ELA FEZ: *"organizar por cliente, em ordem alfabética,
 * mostrando a quantidade de peças compradas em cada ano, o valor das compras
 * e o total dos dois anos."*
 *
 * Este script roda o caminho INTEIRO — a consulta, a montagem da tabela e o
 * PDF —, só sem o modelo no meio. É o teste que não depende de deploy.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-compras-por-ano.ts Ylka
 *   npx ts-node --transpile-only scripts/conferir-compras-por-ano.ts Ylka 2025-01-01 2026-12-31
 *
 * Só SELECT. O PDF sai com os nomes de verdade, porque é ele que se abre; no
 * TERMINAL os nomes saem abreviados, que é a regra da casa para log.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FerramentasGestaoService } from '../src/modules/atendimentos/application/ferramentas-gestao.service';
import { MontarArquivoUseCase } from '../src/modules/relatorios/application/montar-arquivo.use-case';
import { UltimoRelatorioService } from '../src/modules/relatorios/application/ultimo-relatorio.service';

/** "Maria Aurora Mendes" vira "Maria A. M." — o terminal não precisa do resto. */
function abreviar(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return [
    partes[0],
    ...partes.slice(1).map((p) => `${p.charAt(0).toUpperCase()}.`),
  ].join(' ');
}

async function main() {
  const vendedora = process.argv[2] ?? 'Ylka';
  const de = process.argv[3];
  const ate = process.argv[4];

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const ferramentas = app.get(FerramentasGestaoService);
  const ultimo = app.get(UltimoRelatorioService);
  const montarArquivo = app.get(MontarArquivoUseCase);

  const chave = 'conferencia:compras-por-ano';
  const r = await ferramentas
    .montar({ chaveDaConversa: chave, solicitante: 'conferência', verLoja: true })
    .gestaoClientesPorAno({ vendedora, de, ate });

  console.log(`\n=== O QUE A AGENTE RESPONDERIA — ${vendedora} ===\n`);
  console.log(`status: ${r.status}`);
  if (r.status !== 'OK') {
    console.log(`nomes sugeridos: ${(r.nomes ?? []).join(', ') || '—'}`);
    await app.close();
    return;
  }
  console.log(`clientes no total: ${r.total ?? 0}`);
  console.log(`linhas na conversa: ${r.linhas.length}\n`);
  for (const linha of r.linhas.slice(0, 5)) {
    const [nome, resto] = linha.split(' — ');
    console.log(`  ${abreviar(nome)} — ${resto}`);
  }
  if (r.linhas.length > 5) console.log(`  … e mais ${r.linhas.length - 5}`);

  const tabela = ultimo.pegar(chave);
  if (!tabela) {
    console.log('\nNENHUMA TABELA GUARDADA — o "gera o pdf" não teria o que mandar.');
    await app.close();
    return;
  }

  console.log(`\n=== A TABELA QUE VIRA ARQUIVO ===\n`);
  console.log(`título: ${tabela.titulo}`);
  console.log(`colunas: ${tabela.colunas.map((c) => c.titulo).join(' | ')}`);
  console.log(`linhas no arquivo: ${tabela.linhas.length}`);
  console.log(
    `rodapé: ${Object.values(tabela.total ?? {}).join(' | ') || '— (sem rodapé)'}`,
  );
  if (tabela.exibindo) {
    console.log(
      `recorte: exibindo ${tabela.exibindo.mostradas} de ${tabela.exibindo.total}`,
    );
  }

  // O PDF de verdade, pelo mesmo caminho do "gera o pdf" da conversa.
  const arquivo = await montarArquivo.execute(chave, 'PDF', {
    geradoPor: 'conferência',
  });
  if (!arquivo) {
    console.log('\nO MONTADOR NÃO DEVOLVEU ARQUIVO.');
    await app.close();
    return;
  }
  // Fora do repositorio: o PDF e para abrir, nao para sujar a arvore.
  const destino = join(tmpdir(), arquivo.nome);
  writeFileSync(destino, arquivo.conteudo);
  console.log(`\n=== O PDF ===\n`);
  console.log(`nome: ${arquivo.nome}`);
  console.log(`legenda: ${arquivo.legenda}`);
  console.log(`tamanho: ${(arquivo.conteudo.length / 1024).toFixed(1)} KB`);
  console.log(`\nabra: ${destino}\n`);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
