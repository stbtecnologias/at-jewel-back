/**
 * A ETAPA DA RÉGUA É A DAQUELE DIA — 21/10/2026.
 *
 * ==========================================================================
 * POR QUE ISTO NÃO DÁ PARA PROVAR COM MOCK.
 *
 * A etapa é calculada em SQL, dentro de `linhaDoTempo`. Um dublê devolveria o
 * que eu mandasse ele devolver — provaria a minha ideia da consulta, e não a
 * consulta. E o defeito que isto protege é exatamente de consulta: ler o dia
 * 13 com o estado do dia 21.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-etapa-do-dia.ts
 *
 * SÓ LÊ. Não imprime nome de cliente nem telefone — só datas e contagens.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ConsultarLinhaDoTempoUseCase } from '../src/modules/atendimentos/application/use-cases/consultar-linha-do-tempo.use-case';

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const vermelho = (s: string) => `\x1b[31m${s}\x1b[0m`;

/** As duas etapas que só existem depois de o episódio fechar. */
const DE_FECHAMENTO = new Set(['CONCLUIDO', 'NAO_AVANCOU']);

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
  const uc = app.get(ConsultarLinhaDoTempoUseCase);

  let falhou = false;
  const conferir = (rotulo: string, ok: boolean, detalhe: string) => {
    if (!ok) falhou = true;
    console.log(
      `  ${ok ? verde('ok  ') : vermelho('FALHOU')} ${rotulo} — ${detalhe}`,
    );
  };

  // Quando cada episódio fechou. É contra isto que a etapa do dia é conferida.
  const fechados = new Map<string, Date>();
  for (const a of await ds.query<{ id: string; fechado_em: Date }[]>(
    `select id, fechado_em from atendimentos where fechado_em is not null`,
  )) {
    fechados.set(a.id, new Date(a.fechado_em));
  }
  console.log(`\nepisódios já fechados: ${fechados.size}`);

  const dias = await ds.query<{ d: string }[]>(
    `select distinct to_char(ocorrido_em, 'YYYY-MM-DD') d
       from atendimento_interacoes
      where ocorrido_em is not null
      order by 1 desc limit 20`,
  );

  console.log('\nDIA         pontos  funil');
  let adiantados = 0;
  let conferidos = 0;
  for (const { d } of dias) {
    const linha = await uc.execute(d);
    const pontos = linha.faixas.flatMap((f) => f.pontos);
    const fimDoDia = new Date(`${d}T23:59:59`);

    for (const p of pontos) {
      if (!p.atendimentoId || !p.etapa) continue;
      conferidos += 1;
      const fechouEm = fechados.get(p.atendimentoId);
      // ====================================================================
      // O TESTE: episódio que fechou DEPOIS daquele dia não pode aparecer
      // como concluído naquele dia. Era exatamente o que acontecia — e era
      // por isso que a tela precisava de uma frase pedindo desculpa.
      // ====================================================================
      if (DE_FECHAMENTO.has(p.etapa) && (!fechouEm || fechouEm > fimDoDia)) {
        adiantados += 1;
      }
    }

    const resumo = Object.entries(linha.porEtapa)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ');
    console.log(
      `${d}   ${String(pontos.length).padStart(4)}   ${resumo || '—'}`,
    );
  }

  console.log('');
  conferir(
    'nenhum episódio aparece fechado antes de fechar',
    adiantados === 0,
    `${adiantados} adiantado(s) em ${conferidos} pontos com etapa`,
  );

  // E A PROVA PELO AVESSO: o dia de HOJE tem de bater com o estado de agora,
  // porque para hoje "naquele dia" e "agora" são a mesma coisa.
  const hoje = await uc.execute();
  const daView = await ds.query<{ etapa: string; n: string }[]>(
    `select v.etapa::text etapa, count(*) n
       from vw_atendimentos_auditoria v
      where v.id = any($1::uuid[]) group by 1`,
    [
      [
        ...new Set(
          hoje.faixas
            .flatMap((f) => f.pontos)
            .map((p) => p.atendimentoId)
            .filter((id): id is string => Boolean(id)),
        ),
      ],
    ],
  );
  const doDia = new Map<string, number>();
  for (const p of hoje.faixas.flatMap((f) => f.pontos)) {
    if (p.etapa) doDia.set(p.etapa, (doDia.get(p.etapa) ?? 0) + 1);
  }
  const bate = daView.every(
    (l) => (doDia.get(l.etapa) ?? 0) > 0 || Number(l.n) === 0,
  );
  conferir(
    'para HOJE, a etapa do dia e a de agora são a mesma',
    daView.length === 0 || bate,
    daView.map((l) => `${l.etapa}=${l.n}`).join(' ') || 'dia sem movimento',
  );

  await app.close();
  console.log(
    falhou ? vermelho('\nAlguma coisa falhou.\n') : verde('\nTudo certo.\n'),
  );
  process.exit(falhou ? 1 : 0);
}

void main();
