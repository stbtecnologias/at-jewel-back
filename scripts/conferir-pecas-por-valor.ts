/**
 * AS PEÇAS POR FAIXA DE VALOR, CONTRA O BANCO DE VERDADE — 13/10/2026.
 *
 * ==========================================================================
 * OS SPECS PROVAM O CONTORNO. ISTO PROVA O NÚMERO.
 *
 * E aqui o número É o requisito: a pergunta foi "quantas peças acima de 100
 * mil foram vendidas em 2025", e a Anastasia respondeu que não conseguia
 * puxar. Os valores abaixo saíram da base à mão antes de a consulta existir;
 * se a consulta divergir deles, ela está respondendo outra coisa.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-pecas-por-valor.ts
 *
 * Não escreve nada. Só SELECT, e nenhum nome de cliente é impresso.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ConsultarVendasUseCase } from '../src/modules/movimentacoes/application/use-cases/consultar-vendas.use-case';

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const vermelho = (s: string) => `\x1b[31m${s}\x1b[0m`;

const ano = (a: number) => ({
  de: new Date(`${a}-01-01T00:00:00`),
  ate: new Date(`${a}-12-31T23:59:59.999`),
});

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const uc = app.get(ConsultarVendasUseCase);

  let falhou = false;
  const conferir = (rotulo: string, ok: boolean, detalhe: string) => {
    if (!ok) falhou = true;
    console.log(`  ${ok ? verde('ok  ') : vermelho('FALHOU')} ${rotulo} — ${detalhe}`);
  };

  // =========================================================================
  // OS NÚMEROS MEDIDOS À MÃO, ANTES DE A CONSULTA EXISTIR.
  // =========================================================================
  console.log('\nAcima de 100 mil, por ano');
  for (const [a, esperado] of [
    [2023, 22],
    [2024, 29],
    [2025, 59],
  ] as const) {
    const r = await uc.pecasPorFaixa({ janela: ano(a), faixa: { minimo: 100000 } });
    conferir(`${a}`, r?.pecas === esperado, `${r?.pecas} peças (esperado ${esperado})`);
  }

  console.log('\nAcima de 150 mil, por ano');
  for (const [a, esperado] of [
    [2023, 12],
    [2024, 16],
    [2025, 32],
  ] as const) {
    const r = await uc.pecasPorFaixa({ janela: ano(a), faixa: { minimo: 150000 } });
    conferir(`${a}`, r?.pecas === esperado, `${r?.pecas} peças (esperado ${esperado})`);
  }

  // A FAIXA FECHADA é outra pergunta, e tem de dar outro número.
  console.log('\nA faixa fechada');
  const entre = await uc.pecasPorFaixa({
    janela: ano(2025),
    faixa: { minimo: 50000, maximo: 100000 },
  });
  const acima = await uc.pecasPorFaixa({ janela: ano(2025), faixa: { minimo: 100000 } });
  conferir(
    'entre 50 e 100 mil em 2025',
    entre?.pecas === 98,
    `${entre?.pecas} peças (esperado 98)`,
  );
  conferir(
    'e não é a mesma coisa que "acima de 100 mil"',
    entre?.pecas !== acima?.pecas,
    `${entre?.pecas} x ${acima?.pecas}`,
  );

  // O PERÍODO: um trimestre é parte do ano, nunca o ano inteiro.
  console.log('\nO período recorta de verdade');
  const trimestre = await uc.pecasPorFaixa({
    janela: {
      de: new Date('2025-01-01T00:00:00'),
      ate: new Date('2025-03-31T23:59:59.999'),
    },
    faixa: { minimo: 100000 },
  });
  conferir(
    '1º trimestre de 2025',
    (trimestre?.pecas ?? 0) > 0 && (trimestre?.pecas ?? 0) < (acima?.pecas ?? 0),
    `${trimestre?.pecas} de ${acima?.pecas} do ano`,
  );

  // A SOMA DAS VENDEDORAS FECHA COM O TOTAL — se não fechar, alguém sumiu.
  console.log('\nA quebra por vendedora');
  const somaDasPartes = (acima?.porVendedora ?? []).reduce((s, v) => s + v.pecas, 0);
  conferir(
    'a soma das vendedoras é o total',
    somaDasPartes === acima?.pecas,
    `${somaDasPartes} somadas x ${acima?.pecas} no total`,
  );
  conferir(
    'e há mais de uma vendedora na faixa',
    (acima?.porVendedora.length ?? 0) > 1,
    `${acima?.porVendedora.length} vendedoras`,
  );

  // AS DEVOLVIDAS EXISTEM e NÃO estão descontadas.
  console.log('\nAs devolvidas');
  conferir(
    'há peças caras devolvidas em 2025',
    (acima?.devolvidas ?? 0) > 0,
    `${acima?.devolvidas} de ${acima?.pecas}`,
  );

  // A FAIXA QUE NÃO FICA DE PÉ não consulta.
  console.log('\nO que a consulta recusa');
  conferir(
    'faixa sem valor nenhum',
    (await uc.pecasPorFaixa({ janela: ano(2025), faixa: {} })) === null,
    'devolveu null',
  );
  conferir(
    'faixa invertida (mínimo acima do máximo)',
    (await uc.pecasPorFaixa({
      janela: ano(2025),
      faixa: { minimo: 200000, maximo: 1000 },
    })) === null,
    'devolveu null',
  );

  // PAGINAR SEM REPETIR: o empate de preço é comum, e sem desempate a
  // página 2 traz gente da página 1.
  console.log('\nPaginando sem repetir');
  const p1 = await uc.pecasPorFaixa({
    janela: ano(2025),
    faixa: { minimo: 50000 },
    limite: 10,
    deslocamento: 0,
  });
  const p2 = await uc.pecasPorFaixa({
    janela: ano(2025),
    faixa: { minimo: 50000 },
    limite: 10,
    deslocamento: 10,
  });
  const chave = (l: { codigoErp: string | null; quando: Date; valorUnitario: number }) =>
    `${l.codigoErp}|${l.quando.toISOString()}|${l.valorUnitario}`;
  const todas = [...(p1?.linhas ?? []), ...(p2?.linhas ?? [])].map(chave);
  conferir(
    'duas páginas de 10 sem repetir',
    new Set(todas).size === todas.length,
    `${todas.length} linhas, ${new Set(todas).size} distintas`,
  );

  await app.close();
  console.log(falhou ? vermelho('\nAlguma coisa falhou.\n') : verde('\nTudo certo.\n'));
  process.exit(falhou ? 1 : 0);
}

void main();
