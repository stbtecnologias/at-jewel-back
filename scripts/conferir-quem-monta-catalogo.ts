/**
 * QUEM PODE MONTAR CATÁLOGO, E QUANTAS FOTOS CADA PEÇA TEM — RF32, 22/10/2026.
 *
 * ==========================================================================
 * DUAS PERGUNTAS DO LUCAS, E NENHUMA DAS DUAS SE RESPONDE LENDO CÓDIGO.
 *
 *   1. *"a admin, gerente, gerente de vendas, Marketing e vendedoras —
 *      acredito que todo mundo pode fazer isso"*. O papel é DADO desde a
 *      migração que criou `roles`: quem tem `catalogo:write` hoje está no
 *      banco, não no código. Afirmar pelo código seria chutar.
 *
 *   2. *"usa todas... hoje tem poucas fotos, no máximo 3"*. Se a cauda for
 *      maior que isso, "usa todas" vira uma rajada de imagens no WhatsApp —
 *      e o teto de envio conta arquivo como mensagem.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-quem-monta-catalogo.ts
 *
 * SÓ LÊ. Não imprime nome de pessoa, telefone nem e-mail — só papéis,
 * contagens e distribuição, que é o que a decisão precisa.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const vermelho = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const ds = app.get(DataSource);

  // ---------------------------------------------------------------------
  // 1. QUEM TEM A CHAVE DO CATÁLOGO
  // ---------------------------------------------------------------------
  const papeis: { chave: string; nome: string; escreve: boolean; le: boolean }[] =
    await ds.query(`
      SELECT r.chave,
             r.nome,
             bool_or(rp.permissao IN ('catalogo:write', '*')) AS escreve,
             bool_or(rp.permissao IN ('catalogo:read', '*'))  AS le
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_chave = r.chave
       GROUP BY r.chave, r.nome
       ORDER BY r.chave
    `);

  const porPapel: { role: string; quantos: string }[] = await ds.query(`
    SELECT role, COUNT(*)::text AS quantos
      FROM admin_users
     GROUP BY role
  `);
  const gente = new Map(porPapel.map((p) => [p.role, Number(p.quantos)]));

  console.log('\n=== QUEM PODE MONTAR CATÁLOGO ===\n');
  for (const p of papeis) {
    const marca = p.escreve ? verde('escreve') : vermelho('NÃO escreve');
    const leitura = p.le ? 'lê' : vermelho('nem lê');
    const pessoas = gente.get(p.chave) ?? 0;
    console.log(
      `${p.chave.padEnd(16)} ${marca.padEnd(20)} ${leitura.padEnd(14)} ` +
        `${pessoas} pessoa(s)`,
    );
  }

  // As VENDEDORAS não são `admin_users`: o canal delas é outro, e a permissão
  // de catálogo nem chega a ser consultada. Conta separada.
  const [{ total: vendedoras }]: { total: string }[] = await ds.query(
    `SELECT COUNT(*)::text AS total FROM vendedoras WHERE ativo = true`,
  );
  const [{ total: comLogin }]: { total: string }[] = await ds.query(`
    SELECT COUNT(*)::text AS total
      FROM vendedoras v
     WHERE v.ativo = true
       AND v.admin_user_id IS NOT NULL
  `);
  console.log(
    `\nvendedoras ativas: ${vendedoras} — com login no painel: ${comLogin}`,
  );

  // ---------------------------------------------------------------------
  // 2. QUANTAS FOTOS POR PEÇA — o "usa todas" só é barato se a cauda for curta
  // ---------------------------------------------------------------------
  const dist: { fotos: string; pecas: string }[] = await ds.query(`
    SELECT c.fotos::text, COUNT(*)::text AS pecas
      FROM (SELECT produto_id, COUNT(*) AS fotos
              FROM produto_fotos
             GROUP BY produto_id) c
     GROUP BY c.fotos
     ORDER BY c.fotos
  `);

  console.log('\n=== FOTOS NOSSAS POR PEÇA ===\n');
  let pecas = 0;
  let fotos = 0;
  let maior = 0;
  for (const d of dist) {
    const n = Number(d.fotos);
    const q = Number(d.pecas);
    pecas += q;
    fotos += n * q;
    maior = Math.max(maior, n);
    console.log(`${String(n).padStart(2)} foto(s): ${q} peça(s)`);
  }
  console.log(
    `\n${pecas} peça(s) com foto nossa, ${fotos} foto(s) ao todo, ` +
      `maior caso: ${maior}.`,
  );

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
