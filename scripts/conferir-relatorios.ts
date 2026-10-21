/**
 * OS RELATÓRIOS, CONTRA O BANCO DE VERDADE — RF36 e RF37, 21/10/2026.
 *
 * ==========================================================================
 * GERA OS ARQUIVOS E ABRE, PORQUE RELATÓRIO SE CONFERE OLHANDO.
 *
 * Um teste prova que o PDF tem bytes. Não prova que a coluna "Descrição" não
 * vazou a margem, que o total bate com a soma, nem que a planilha SOMA — que
 * é a única razão de existir uma planilha.
 *
 * Então isto escreve os quatro arquivos em `tmp/` e diz onde. Abrir é o
 * teste.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-relatorios.ts
 *
 * SÓ LÊ do banco. Escreve só em `tmp/`, que não vai para o git.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RelatorioDeProdutosUseCase } from '../src/modules/relatorios/application/relatorio-de-produtos.use-case';
import { RelatorioDeVendasUseCase } from '../src/modules/relatorios/application/relatorio-de-vendas.use-case';
import { RelatorioPdfService } from '../src/modules/relatorios/infrastructure/relatorio-pdf.service';
import {
  RelatorioXlsxService,
  numeroDe,
} from '../src/modules/relatorios/infrastructure/relatorio-xlsx.service';
import { nomeDoArquivo } from '../src/modules/relatorios/domain/relatorio';

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const vermelho = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const ds = app.get(DataSource);
  const mudo = () => undefined;
  (ds as unknown as { logger: Record<string, () => void> }).logger = {
    logQuery: mudo,
    logQueryError: mudo,
    logQuerySlow: mudo,
    logSchemaBuild: mudo,
    logMigration: mudo,
    log: mudo,
  };

  let falhou = false;
  const conferir = (rotulo: string, ok: boolean, detalhe: string) => {
    if (!ok) falhou = true;
    console.log(
      `  ${ok ? verde('ok  ') : vermelho('FALHOU')} ${rotulo} — ${detalhe}`,
    );
  };

  const pdf = app.get(RelatorioPdfService);
  const xlsx = app.get(RelatorioXlsxService);
  const pasta = join(process.cwd(), 'tmp');
  mkdirSync(pasta, { recursive: true });

  for (const [nome, relatorio] of [
    [
      'produtos',
      await app
        .get(RelatorioDeProdutosUseCase)
        .execute({ geradoPor: 'Conferência' }),
    ],
    [
      'vendas',
      await app
        .get(RelatorioDeVendasUseCase)
        .execute({ geradoPor: 'Conferência' }),
    ],
  ] as const) {
    console.log(`\n${relatorio.titulo}`);
    conferir(
      'tem linha',
      relatorio.linhas.length > 0,
      `${relatorio.linhas.length} linhas`,
    );
    conferir(
      'toda linha tem valor em TODA coluna declarada',
      relatorio.linhas.every((l) =>
        relatorio.colunas.every((c) => l[c.chave] !== undefined),
      ),
      relatorio.colunas.map((c) => c.chave).join(', '),
    );
    // O RELATORIO NAO TEM CARTAO DE RESUMO — decisao do Lucas em 21/10. O
    // numero do alto repetia a linha de TOTAL da tabela, e resumo que repete
    // a tabela nao resume. Aqui o que se confere e que o total EXISTE, que e
    // onde a soma passou a morar sozinha.
    conferir(
      'a tabela tem linha de total',
      Boolean(relatorio.total),
      Object.values(relatorio.total ?? {}).join(' · ') || 'sem total',
    );

    const bytesPdf = await pdf.gerar(relatorio);
    const bytesXlsx = await xlsx.gerar(relatorio);
    // %PDF-1. — se o cabeçalho não está aí, não é PDF, por mais bytes que tenha.
    conferir(
      'o PDF é um PDF',
      bytesPdf.subarray(0, 5).toString() === '%PDF-',
      `${(bytesPdf.length / 1024).toFixed(0)} KB`,
    );
    // PK — todo xlsx é um zip.
    conferir(
      'a planilha é um xlsx',
      bytesXlsx.subarray(0, 2).toString() === 'PK',
      `${(bytesXlsx.length / 1024).toFixed(0)} KB`,
    );

    console.log(
      `  ${escrever(pasta, nomeDoArquivo(relatorio.titulo, 'pdf'), bytesPdf)}`,
    );
    console.log(
      `  ${escrever(pasta, nomeDoArquivo(relatorio.titulo, 'xlsx'), bytesXlsx)}`,
    );
  }

  // ======================================================================
  // E A PROVA QUE SÓ A PLANILHA PODE DAR: o valor virou NÚMERO.
  //
  // Guardado como texto, "R$ 98.900,00" não soma e não ordena — e aí a
  // planilha é um PDF feio. Isto confere a conversão no mesmo lugar em que
  // ela acontece.
  // ======================================================================
  console.log('\nO número de dentro do texto');
  for (const [texto, esperado] of [
    ['R$ 98.900,00', 98900],
    ['R$ 1.234,56', 1234.56],
    ['1.545', 1545],
    ['61%', 61],
    ['AN20477', null],
    ['—', null],
  ] as const) {
    conferir(`"${texto}"`, numeroDe(texto) === esperado, `${numeroDe(texto)}`);
  }

  await app.close();
  console.log(
    falhou ? vermelho('\nAlguma coisa falhou.\n') : verde('\nTudo certo.\n'),
  );
  process.exit(falhou ? 1 : 0);
}

/**
 * ESCREVE, E NAO DESISTE PORQUE O ARQUIVO ESTA ABERTO.
 *
 * Conferir relatorio E abrir o arquivo — entao a segunda rodada SEMPRE encontra
 * o PDF aberto no leitor, e o Windows trava a escrita com EBUSY. A conferencia
 * morria no meio e as provas seguintes nem rodavam.
 *
 * Com o nome alternativo, quem esta olhando continua olhando e a rodada nova
 * tem para onde ir — e o caminho impresso diz qual arquivo e qual.
 */
function escrever(pasta: string, nome: string, bytes: Buffer): string {
  const alvo = join(pasta, nome);
  try {
    writeFileSync(alvo, bytes);
    return alvo;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EBUSY') throw e;
    const hora = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
    const outro = alvo.replace(/(.[a-z]+)$/, `-${hora}$1`);
    writeFileSync(outro, bytes);
    return `${outro}   (o outro estava aberto)`;
  }
}

void main();
