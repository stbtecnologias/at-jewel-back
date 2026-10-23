/**
 * O QUE A GERENTE DE VENDAS ALCANÇA HOJE — 23/10/2026.
 *
 * ==========================================================================
 * O PEDIDO: *"o perfil de gerente de vendas não pode ver essas vendedoras e
 * tudo que contém elas — Faby Lima, Aline Pinho, Loja, Daniele Reis. Não
 * aparece na Helena nem no painel: os rankings de vendas, as próprias
 * vendas."*
 *
 * O recorte de equipe já existe desde 28/09 (`admin_users.equipe_id` ×
 * `vendedoras.equipe_id`). A pergunta que este script responde é se ele
 * BASTA — ou seja, se as quatro estão fora da equipe e as outras dentro.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-escopo-gerente.ts
 *
 * Só SELECT. Nome de VENDEDORA e de equipe aparecem (são da casa); nenhum
 * nome de cliente é impresso.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

const AS_QUATRO = ['Faby Lima', 'Aline Pinho', 'Loja', 'Daniele Reis'];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const ds = app.get(DataSource);

  console.log('\n=== AS VENDEDORAS ===\n');
  const vendedoras = await ds.query<
    {
      nome: string;
      ativo: boolean;
      equipe: string | null;
      vendas: string;
      tem_login: boolean;
    }[]
  >(`
    SELECT v.nome,
           v.ativo,
           e.nome                                   AS equipe,
           (SELECT count(*) FROM movimentacoes m
             WHERE m.vendedora_id = v.id AND m.ativo) AS vendas,
           (v.admin_user_id IS NOT NULL) AS tem_login
      FROM vendedoras v
      LEFT JOIN equipes e ON e.id = v.equipe_id
     ORDER BY v.ativo DESC, v.nome
  `);
  for (const v of vendedoras) {
    const marca = AS_QUATRO.some(
      (q) => q.toLowerCase() === v.nome.trim().toLowerCase(),
    )
      ? ' <<< AS QUATRO'
      : '';
    console.log(
      `  ${v.ativo ? 'ativa  ' : 'inativa'} ${v.nome.padEnd(28)} equipe=${String(
        v.equipe ?? '—',
      ).padEnd(18)} vendas=${String(v.vendas).padStart(5)}${
        v.tem_login ? ' login' : ''
      }${marca}`,
    );
  }

  console.log('\n=== AS EQUIPES ===\n');
  const equipes = await ds.query<
    { equipe: string; vendedoras: string; usuarios: string }[]
  >(`
    SELECT e.nome AS equipe,
           (SELECT count(*) FROM vendedoras v WHERE v.equipe_id = e.id)  AS vendedoras,
           (SELECT count(*) FROM admin_users u WHERE u.equipe_id = e.id) AS usuarios
      FROM equipes e ORDER BY e.nome
  `);
  if (equipes.length === 0) console.log('  (nenhuma equipe cadastrada)');
  for (const e of equipes) {
    console.log(
      `  ${e.equipe.padEnd(24)} ${String(e.vendedoras).padStart(3)} vendedoras · ${e.usuarios} usuário(s)`,
    );
  }

  console.log('\n=== OS USUÁRIOS DO PAINEL, POR PERFIL ===\n');
  const usuarios = await ds.query<
    {
      role: string;
      nome: string;
      ativo: boolean;
      equipe: string | null;
      vendedora: string | null;
    }[]
  >(`
    SELECT u.role, u.nome, true AS ativo,
           e.nome AS equipe,
           v.nome AS vendedora
      FROM admin_users u
      LEFT JOIN equipes e    ON e.id = u.equipe_id
      LEFT JOIN vendedoras v ON v.admin_user_id = u.id
     ORDER BY u.role, u.nome
  `);
  for (const u of usuarios) {
    console.log(
      `  ${u.role.padEnd(16)} ${u.nome.padEnd(24)} equipe=${String(
        u.equipe ?? '—',
      ).padEnd(18)} vendedora=${u.vendedora ?? '—'}${u.ativo ? '' : ' (inativo)'}`,
    );
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
