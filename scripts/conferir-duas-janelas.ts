/**
 * A CONVERSA DAS 10:12, REPRODUZIDA CONTRA O BANCO — 27/10/2026.
 *
 * ==========================================================================
 * *"As vendas da Ylka em 2025 e 2026"* viram DUAS consultas, uma por ano —
 * é o que a instrução de `de`/`ate` manda. Em produção, a segunda apagou a
 * primeira e o PDF saiu *"só com as vendas de 2026"*.
 *
 * Este script faz as duas chamadas na MESMA chave de conversa, como o modelo
 * fez, e depois pede o arquivo. O número que importa é um só: as linhas do
 * PDF têm de ser 2025 + 2026, e o título tem de falar dos dois anos.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-duas-janelas.ts Ylka 2025 2026
 *
 * Só SELECT, e não ocupa a porta 3000 — sobe o contexto do Nest, não o
 * servidor. No TERMINAL os nomes saem abreviados, que é a regra da casa
 * para log; no PDF vão inteiros, porque é ele que se lê.
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
  const anos = (process.argv.slice(3).length > 0
    ? process.argv.slice(3)
    : ['2025', '2026']
  ).map(Number);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const ferramentas = app.get(FerramentasGestaoService);
  const ultimo = app.get(UltimoRelatorioService);
  const montarArquivo = app.get(MontarArquivoUseCase);

  const chave = 'conferencia:duas-janelas';
  const gestao = ferramentas.montar({
    chaveDaConversa: chave,
    solicitante: 'conferência',
    verLoja: true,
  });

  let somaDosTotais = 0;
  for (const ano of anos) {
    const r = await gestao.gestaoVendasDetalhadas({
      vendedora,
      de: `${ano}-01-01`,
      ate: `${ano}-12-31`,
    });
    console.log(`\n=== CHAMADA DE ${ano} ===\n`);
    console.log(`status: ${r.status}`);
    if (r.status !== 'OK') {
      console.log(`nomes sugeridos: ${(r.nomes ?? []).join(', ') || '—'}`);
      await app.close();
      return;
    }
    const total = r.total ?? r.linhas.length;
    somaDosTotais += total;
    console.log(`vendas no total: ${total}`);
    console.log(`linhas na conversa: ${r.linhas.length}`);
    for (const linha of r.linhas.slice(0, 2)) {
      console.log(`  ${semNomeInteiro(linha).slice(0, 118)}`);
    }
  }

  const tabela = ultimo.pegar(chave);
  if (!tabela) {
    console.log(
      '\nNENHUMA TABELA GUARDADA — o "gera o pdf" não teria o que mandar.',
    );
    await app.close();
    return;
  }

  console.log(`\n=== A TABELA QUE VIRA ARQUIVO ===\n`);
  console.log(`título: ${tabela.titulo}`);
  console.log(`colunas: ${tabela.colunas.map((c) => c.titulo).join(' | ')}`);
  console.log(`linhas no arquivo: ${tabela.linhas.length}`);
  console.log(`soma dos totais das chamadas: ${somaDosTotais}`);
  console.log(
    tabela.linhas.length === somaDosTotais
      ? 'OK — o arquivo leva os dois períodos.'
      : 'FALHOU — o arquivo perdeu linhas de algum período.',
  );
  console.log(`nota: ${tabela.nota ?? '—'}`);

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
  console.log(`tamanho: ${(arquivo.conteudo.length / 1024).toFixed(1)} KB`);
  console.log(`\nabra: ${destino}\n`);

  await app.close();
}

/** O nome do cliente — "MARIA AURORA MENDES (00360)" — abreviado na linha. */
function semNomeInteiro(linha: string): string {
  return linha.replace(
    /· ([^·()]+?) \((\d+)\) ·/,
    (_todo, nome: string, codigo: string) =>
      `· ${abreviar(nome)} (${codigo}) ·`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
