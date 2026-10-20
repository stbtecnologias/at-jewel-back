/**
 * QUANTO DA TIMELINE É CONVERSA ENTRE GENTE DA CASA — RF30, 20/10/2026.
 *
 * ==========================================================================
 * O QUE ELE MEDE, E POR QUE NÃO DÁ PARA MEDIR COM UM `JOIN`.
 *
 * Os dois lados hasheiam o telefone em FORMATOS DIFERENTES: o que vem do
 * WhatsApp guarda a forma com DDI (12-13 dígitos, começando em 55), e o
 * cadastro guarda a forma do ERP (11 dígitos, sem o 55). Hash de formas
 * diferentes nunca casa — e a primeira versão desta consulta devolvia ZERO,
 * com cara de "não tem contaminação nenhuma".
 *
 * Então aqui o conjunto de "gente de dentro" é montado com TODAS as variantes
 * de cada número, do mesmo jeito que `variantesTelefone` faz no código.
 *
 * E são TRÊS origens de número, não uma:
 *
 *   vendedoras.whatsapp_interno   — o pessoal dela
 *   vendedoras.whatsapp_externo   — o corporativo, o que fala com cliente
 *   admin_users.telefone          — financeiro, gerência, administração
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-gente-de-dentro.ts
 *
 * SÓ LÊ. E NÃO IMPRIME NENHUM TELEFONE, NENHUM NOME E NENHUM HASH — só
 * contagens, que é o que a decisão precisa.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { hashField } from '../src/shared/database/transformers/encrypted-column.transformer';
import { variantesTelefone } from '../src/modules/clientes/application/utils/normalizadores';
import { VendedoraOrmEntity } from '../src/modules/vendedoras/infrastructure/database/typeorm/entities/vendedora.orm-entity';
import { AdminUserOrmEntity } from '../src/modules/auth/infrastructure/database/typeorm/entities/admin-user.orm-entity';

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const amarelo = (s: string) => `\x1b[33m${s}\x1b[0m`;

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

  // ======================================================================
  // O CONJUNTO DE DENTRO, com todas as variantes de cada numero.
  // ======================================================================
  // ======================================================================
  // E CADA VARIANTE ENTRA DUAS VEZES: SOLTA E COM `@c.us`.
  //
  // `conversas_whatsapp.chat_id_hash` nao e o hash do telefone — e o hash de
  // `<telefone>@c.us`, que e o chat id do WhatsApp (ver
  // `RegistrarContatoWhatsappUseCase`). Sem esta linha a conferencia devolvia
  // ZERO conversas de gente de dentro, e zero tinha cara de "nao tem".
  //
  // E a MESMA armadilha que ja apareceu duas vezes neste projeto: filtrar por
  // coluna que nao casa devolve vazio, e vazio parece resposta.
  // ======================================================================
  const deDentro = new Set<string>();
  const marcar = (numero: string | null | undefined) => {
    if (!numero) return 0;
    let n = 0;
    for (const v of variantesTelefone(numero)) {
      deDentro.add(hashField(v));
      deDentro.add(hashField(`${v}@c.us`));
      n += 1;
    }
    return n;
  };

  const vendedoras = await ds.getRepository(VendedoraOrmEntity).find();
  const admins = await ds.getRepository(AdminUserOrmEntity).find();

  let comInterno = 0;
  let comExterno = 0;
  for (const v of vendedoras) {
    if (marcar(v.whatsappInterno) > 0) comInterno += 1;
    if (marcar(v.whatsappExterno) > 0) comExterno += 1;
  }
  let adminsComTelefone = 0;
  for (const a of admins) {
    if (marcar(a.telefone) > 0) adminsComTelefone += 1;
  }

  console.log('\nDE ONDE SAI "GENTE DE DENTRO"\n');
  console.log(`  vendedoras cadastradas            ${vendedoras.length}`);
  console.log(`    com whatsapp PESSOAL            ${comInterno}`);
  console.log(`    com whatsapp CORPORATIVO        ${comExterno}`);
  console.log(`  contas de painel                  ${admins.length}`);
  console.log(`    com telefone cadastrado         ${adminsComTelefone}`);
  console.log(`  hashes no conjunto (com variantes) ${deDentro.size}`);

  const lista = [...deDentro];
  const dentro = (hash: string | null) => !!hash && deDentro.has(hash);

  // ======================================================================
  // 1. AS CONVERSAS LIDAS — a origem de tudo que chega na timeline.
  // ======================================================================
  const conversas = await ds.query<{ chat_id_hash: string | null }[]>(
    `select chat_id_hash from conversas_whatsapp`,
  );
  const conversasDeDentro = conversas.filter((c) =>
    dentro(c.chat_id_hash),
  ).length;

  // ======================================================================
  // 2. OS LEADS — o funil.
  // ======================================================================
  const leads = await ds.query<
    { whatsapp_hash: string | null; cliente_id: string | null }[]
  >(`select whatsapp_hash, cliente_id from leads`);
  const leadsDeDentro = leads.filter((l) => dentro(l.whatsapp_hash)).length;

  // ======================================================================
  // 3. OS CLIENTES QUE SAO GENTE DA CASA — e e por eles que o RELATO entra
  //    na timeline de um "cliente".
  // ======================================================================
  const clientesDeDentro = await ds.query<{ id: string }[]>(
    `select id from clientes where telefone_1_hash = any($1::text[])`,
    [lista],
  );
  const ids = clientesDeDentro.map((c) => c.id);

  const [atend] = await ds.query<{ total: string; de_dentro: string }[]>(
    `select count(*) total,
            count(*) filter (where cliente_id = any($1::uuid[])) de_dentro
       from atendimentos`,
    [ids.length ? ids : [null]],
  );

  const [relatos] = await ds.query<{ total: string; de_dentro: string }[]>(
    `select count(*) total,
            count(*) filter (
              where a.cliente_id = any($1::uuid[])) de_dentro
       from atendimento_interacoes i
       join atendimentos a on a.id = i.atendimento_id
      where i.tipo = 'RELATO'`,
    [ids.length ? ids : [null]],
  );

  const pct = (n: number, t: number) =>
    t === 0 ? '—' : `${Math.round((n / t) * 100)}%`;

  console.log('\nO QUE A TIMELINE ESTA MOSTRANDO\n');
  const linha = (rotulo: string, n: number, total: number) =>
    console.log(
      `  ${rotulo.padEnd(34)} ${String(n).padStart(4)} de ${String(total).padStart(4)}   ${amarelo(pct(n, total))}`,
    );

  linha(
    'conversas lidas de gente de dentro',
    conversasDeDentro,
    conversas.length,
  );
  linha('leads de gente de dentro', leadsDeDentro, leads.length);
  linha('clientes que sao gente da casa', ids.length, 0 || ids.length);
  linha(
    'atendimentos de gente da casa',
    Number(atend.de_dentro),
    Number(atend.total),
  );
  linha(
    'RELATOs na timeline de gente da casa',
    Number(relatos.de_dentro),
    Number(relatos.total),
  );

  console.log(
    `\n${verde('O conserto tem de olhar os TRES numeros')} — pessoal e corporativo da` +
      ' vendedora, e o telefone da conta de painel.\n',
  );

  await app.close();
  process.exit(0);
}

void main();
