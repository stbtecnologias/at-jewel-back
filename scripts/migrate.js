#!/usr/bin/env node
/* eslint-disable */
/**
 * Controle de migracoes — A.T. Jewel
 * ============================================================================
 *
 * O projeto usa migracoes em SQL cru (`src/shared/database/migrations/*.sql`),
 * escritas a mao e aplicadas a mao. Nao ha runner do TypeORM: `synchronize` e
 * false e nenhuma migracao e classe `.ts`. Esse formato foi decisao consciente
 * — o schema usa indice parcial, GIN, CHECK, ENUM nativo e view materializada,
 * que o gerador do TypeORM nao produz bem, e os comentarios das migracoes
 * carregam o porque de cada decisao.
 *
 * O que faltava era saber ONDE cada migracao ja rodou. Este script resolve so
 * isso: mantem a tabela `schema_migrations` e aplica o que falta, em ordem.
 * Nenhum `.sql` existente e alterado.
 *
 * COMANDOS
 *   npm run db:status     lista aplicadas e pendentes (nao altera nada)
 *   npm run db:verify     checa no schema se cada migracao de fato rodou
 *   npm run db:baseline   marca as atuais como aplicadas, sem executar
 *   npm run db:migrate    aplica as pendentes
 *
 * AMBIENTES
 *   Existem dois: local e producao. Nao ha homolog. Local e producao usam o
 *   MESMO nome de banco (`atjewel_dev`), o MESMO usuario e a MESMA porta — so
 *   o host difere. Por isso `migrate` e `baseline` exigem confirmacao digitada
 *   quando o host nao e local. Nao e paranoia: um comando copiado de um
 *   terminal para o outro roda identico nos dois.
 *
 * BASELINE
 *   Os bancos existentes ja tem as 25 migracoes aplicadas. `baseline` carimba
 *   isso sem re-executar — o que e obrigatorio, porque 6 migracoes (03, 04,
 *   05, 06, 08, 09) tem `CREATE TYPE` sem guarda e falham na segunda execucao.
 *   Rodar `verify` ANTES do baseline: carimbar um ambiente que perdeu uma
 *   migracao faz o controle mentir com confianca, o que e pior que nao ter.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { Client } = require('pg');

const DIR_MIGRACOES = path.join(__dirname, '..', 'src', 'shared', 'database', 'migrations');
const CAMINHO_ENV = path.join(__dirname, '..', '.env');

// ---------------------------------------------------------------------------
// Manifesto de verificacao
//
// Um marcador por migracao: um objeto cuja existencia prova que ela rodou.
// Migracoes que criam tabela sao diretas; as 10 que so fazem ALTER exigem
// checar a coluna ou o indice especifico. Levantado arquivo por arquivo.
//
// tipo: 'tabela' | 'coluna' | 'indice' | 'tipo' | 'matview' | 'nullable'
//     | 'constraint' | 'permissao'
// ---------------------------------------------------------------------------
const MANIFESTO = {
  '01_init.sql':                          { tipo: 'tabela',   alvo: 'produtos' },
  '02_auth.sql':                          { tipo: 'tabela',   alvo: 'api_keys' },
  '03_clientes.sql':                      { tipo: 'tabela',   alvo: 'clientes_perfil' },
  '04_vendedoras.sql':                    { tipo: 'tabela',   alvo: 'vendedoras' },
  '05_agente_eventos.sql':                { tipo: 'tabela',   alvo: 'agente_eventos' },
  '06_clientes_perfil_extensoes.sql':     { tipo: 'coluna',   alvo: 'clientes_perfil.tags' },
  '07_refresh_token_expiracao.sql':       { tipo: 'coluna',   alvo: 'admin_users.refresh_token_expires_at' },
  '08_admin_users_role.sql':              { tipo: 'coluna',   alvo: 'admin_users.role' },
  '09_vendas.sql':                        { tipo: 'tabela',   alvo: 'pagamentos_venda' },
  '10_vendedoras_metricas.sql':           { tipo: 'matview',  alvo: 'vendedoras_metricas' },
  '11_api_keys_expiracao.sql':            { tipo: 'coluna',   alvo: 'api_keys.expires_at' },
  '12_perfil_indice_sla.sql':             { tipo: 'indice',   alvo: 'idx_perfil_estado_sla' },
  '13_perfil_primeiro_contato.sql':       { tipo: 'coluna',   alvo: 'clientes_perfil.primeiro_contato_em' },
  '14_metas.sql':                         { tipo: 'tabela',   alvo: 'metas' },
  '15_defeitos.sql':                      { tipo: 'tabela',   alvo: 'defeitos_devolucoes' },
  '16_reconciliacao_estoque_demografia.sql': { tipo: 'coluna', alvo: 'produtos.estoque_atual' },
  '17_conversas.sql':                     { tipo: 'tabela',   alvo: 'conversas' },
  '18_admin_users_nome.sql':              { tipo: 'coluna',   alvo: 'admin_users.nome' },
  // 19 nao cria objeto: so torna password_hash opcional. O marcador e a propria
  // nulabilidade da coluna.
  '19_admin_users_senha_opcional.sql':    { tipo: 'nullable', alvo: 'admin_users.password_hash' },
  '20_agente_prompts.sql':                { tipo: 'tabela',   alvo: 'agente_prompts' },
  '21_roles_permissoes.sql':              { tipo: 'tabela',   alvo: 'role_permissions' },
  // 22 e majoritariamente INSERT de permissao; o unico DDL e este indice.
  '22_vendas_read_all.sql':               { tipo: 'indice',   alvo: 'idx_vendedoras_admin_user_id' },
  '23_clientes_perfil_idade.sql':         { tipo: 'coluna',   alvo: 'clientes_perfil.idade' },
  '24_consignacoes.sql':                  { tipo: 'tabela',   alvo: 'consignacoes' },
  '25_demandas.sql':                      { tipo: 'tabela',   alvo: 'demandas' },
  '26_fornecedores.sql':                  { tipo: 'tabela',     alvo: 'fornecedores' },
  '27_empresas.sql':                      { tipo: 'tabela',     alvo: 'empresas' },
  '28_formas_pagamento.sql':              { tipo: 'tabela',     alvo: 'formas_pagamento' },
  // 29 nao cria tabela nem indice: fecha tres FKs por codigo ERP. O marcador e
  // a primeira das constraints — as tres entram na MESMA transacao, entao uma
  // existir significa que as tres existem.
  '29_fk_vendedora_codigo.sql':           { tipo: 'constraint', alvo: 'fk_clientes_vendedora_codigo' },
  // 30 e 31 nao tem DDL nenhum — so semeiam permissao. O marcador e a propria
  // linha em role_permissions.
  '30_permissao_clientes_write.sql':      { tipo: 'permissao',  alvo: 'ADMIN|clientes:write' },
  '31_permissoes_consignacoes.sql':       { tipo: 'permissao',  alvo: 'ESTOQUISTA|vendedoras:read' },
  // 32 cria TRES tabelas. O marcador e `estoque` porque ela referencia as
  // outras duas — se ela existe, grupos_estoque e locais_estoque existem.
  '32_estoque.sql':                       { tipo: 'tabela',     alvo: 'estoque' },
  '33_permissoes_estoque.sql':            { tipo: 'permissao',  alvo: 'ESTOQUISTA|estoque:write' },
};

// ---------------------------------------------------------------------------
// .env — parser minimo. Evita depender de dotenv, que aqui e so dependencia
// transitiva do @nestjs/config e pode sumir num npm prune.
// ---------------------------------------------------------------------------
function lerEnv() {
  const env = { ...process.env };
  if (!fs.existsSync(CAMINHO_ENV)) return env;

  for (const linha of fs.readFileSync(CAMINHO_ENV, 'utf8').split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const igual = limpa.indexOf('=');
    if (igual === -1) continue;
    const chave = limpa.slice(0, igual).trim();
    let valor = limpa.slice(igual + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    // Variavel ja definida no ambiente real ganha do .env — o container de
    // producao injeta as suas por `environment:` do compose.
    if (env[chave] === undefined) env[chave] = valor;
  }
  return env;
}

/**
 * Conexao. `DATABASE_URL` e a fonte canonica — e o que o `app.module.ts` usa
 * (`config.getOrThrow('DATABASE_URL')`), e o docker-compose a sobrescreve no
 * container para apontar ao host `postgres` da rede interna. Montar a conexao
 * pelas variaveis avulsas ignora esse override e tenta `localhost`, que dentro
 * do container e o proprio container.
 *
 * Devolve as opcoes do pg separadas dos campos de exibicao: passar
 * connectionString junto com host/port/database confunde o driver.
 */
function conexao(env) {
  const url = env.DATABASE_URL || env.POSTGRES_URL;

  if (url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      throw new Error('DATABASE_URL definida mas em formato invalido.');
    }
    return {
      pg: { connectionString: url },
      host: u.hostname,
      port: Number(u.port || 5432),
      user: decodeURIComponent(u.username || ''),
      database: u.pathname.replace(/^\//, ''),
      origem: 'DATABASE_URL',
    };
  }

  const avulso = {
    host: env.POSTGRES_HOST || env.DB_HOST || 'localhost',
    port: Number(env.POSTGRES_PORT || env.DB_PORT || 5432),
    user: env.POSTGRES_USER || env.DB_USER,
    password: env.POSTGRES_PASSWORD || env.DB_PASSWORD,
    database: env.POSTGRES_DB || env.DB_NAME,
  };
  return { pg: avulso, ...avulso, origem: 'variaveis avulsas' };
}

// Loopback, ou o nome do servico/container dentro da rede do compose.
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'atjewel_postgres']);

/**
 * Producao nao da para deduzir do host: rodando DENTRO do servidor de producao
 * o banco tambem e `localhost`, e pelo container e `postgres` — os dois
 * parecem local. E `NODE_ENV` nao ajuda: o compose fixa `development` nos dois
 * ambientes.
 *
 * Por isso o criterio e um marcador explicito no `.env`:  AMBIENTE=producao
 * Como o compose carrega o `.env` via `env_file`, uma linha so vale tanto para
 * quem roda no host quanto por `docker exec`.
 *
 * O host continua valendo como rede de seguranca para conexao remota (ex.:
 * apontar o .env local para 10.29.0.137).
 */
function ehProducao(env, host) {
  const marcador = String(env.AMBIENTE || env.APP_ENV || '').trim().toLowerCase();
  if (['producao', 'production', 'prod'].includes(marcador)) return true;
  return !HOSTS_LOCAIS.has(String(host).toLowerCase());
}

// ---------------------------------------------------------------------------
// Leitura dos arquivos
//
// Ordena pelo NUMERO do prefixo, nao pelo nome. Alfabeticamente '100_' viria
// antes de '26_' e o schema montaria fora de ordem — hoje passa despercebido
// porque todos tem dois digitos.
// ---------------------------------------------------------------------------
function listarMigracoes() {
  if (!fs.existsSync(DIR_MIGRACOES)) {
    throw new Error(`Pasta de migracoes nao encontrada: ${DIR_MIGRACOES}`);
  }

  return fs
    .readdirSync(DIR_MIGRACOES)
    .filter((n) => n.endsWith('.sql'))
    .map((nome) => {
      const m = nome.match(/^(\d+)/);
      if (!m) throw new Error(`Migracao sem prefixo numerico: ${nome}`);
      const conteudo = fs.readFileSync(path.join(DIR_MIGRACOES, nome), 'utf8');
      return {
        nome,
        ordem: Number(m[1]),
        conteudo,
        checksum: crypto.createHash('sha256').update(conteudo).digest('hex'),
      };
    })
    .sort((a, b) => a.ordem - b.ordem);
}

async function garantirTabela(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      versao      VARCHAR(255) PRIMARY KEY,
      checksum    VARCHAR(64)  NOT NULL,
      aplicada_em TIMESTAMPTZ  NOT NULL DEFAULT now()
    )
  `);
}

async function aplicadas(client) {
  const { rows } = await client.query(
    'SELECT versao, checksum, aplicada_em FROM schema_migrations',
  );
  return new Map(rows.map((r) => [r.versao, r]));
}

// ---------------------------------------------------------------------------
// Verificacao — o marcador de cada migracao existe no schema?
// ---------------------------------------------------------------------------
async function existeMarcador(client, { tipo, alvo }) {
  switch (tipo) {
    case 'tabela': {
      const { rows } = await client.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1`,
        [alvo],
      );
      return rows.length > 0;
    }
    case 'coluna': {
      const [tabela, coluna] = alvo.split('.');
      const { rows } = await client.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [tabela, coluna],
      );
      return rows.length > 0;
    }
    case 'nullable': {
      const [tabela, coluna] = alvo.split('.');
      const { rows } = await client.query(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [tabela, coluna],
      );
      return rows.length > 0 && rows[0].is_nullable === 'YES';
    }
    case 'indice': {
      const { rows } = await client.query(
        `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
        [alvo],
      );
      return rows.length > 0;
    }
    case 'matview': {
      const { rows } = await client.query(
        `SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = $1`,
        [alvo],
      );
      return rows.length > 0;
    }
    case 'tipo': {
      const { rows } = await client.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [alvo]);
      return rows.length > 0;
    }
    // Constraint nomeada (FK, check, unique). Serve para migracao que so
    // amarra tabelas existentes e por isso nao cria objeto proprio.
    case 'constraint': {
      const { rows } = await client.query(
        `SELECT 1 FROM pg_constraint c
           JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE c.conname = $1 AND n.nspname = 'public'`,
        [alvo],
      );
      return rows.length > 0;
    }
    // Migracao sem DDL, que so semeia permissao de papel. O marcador e a linha
    // em role_permissions. Alvo no formato 'PAPEL|permissao' — o separador e
    // `|` e nao `:` porque a permissao ja contem dois-pontos.
    case 'permissao': {
      const [papel, permissao] = alvo.split('|');
      const { rows } = await client.query(
        `SELECT 1 FROM role_permissions WHERE role_chave = $1 AND permissao = $2`,
        [papel, permissao],
      );
      return rows.length > 0;
    }
    default:
      throw new Error(`Tipo de marcador desconhecido: ${tipo}`);
  }
}

async function verificar(client, migracoes) {
  const resultado = [];
  for (const m of migracoes) {
    const marcador = MANIFESTO[m.nome];
    if (!marcador) {
      resultado.push({ nome: m.nome, estado: 'sem-manifesto' });
      continue;
    }
    const existe = await existeMarcador(client, marcador);
    resultado.push({
      nome: m.nome,
      estado: existe ? 'presente' : 'ausente',
      marcador: `${marcador.tipo} ${marcador.alvo}`,
    });
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Confirmacao para host nao-local
// ---------------------------------------------------------------------------
function confirmar(pergunta) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(pergunta, (r) => { rl.close(); resolve(r.trim()); }));
}

async function exigirConfirmacao(cfg, acao) {
  if (!cfg.producao) return true;

  console.log('');
  console.log('  \x1b[41m\x1b[97m  PRODUCAO  \x1b[0m');
  console.log(`  host:  ${cfg.host}:${cfg.port}`);
  console.log(`  banco: ${cfg.database}`);
  console.log(`  acao:  ${acao}`);
  console.log('');

  // Sem TTY (ex.: `docker exec` sem -it) nao ha como confirmar. Abortar e o
  // certo: rodar direto seria exatamente o que a barreira existe para impedir.
  if (!process.stdin.isTTY) {
    console.log('  \x1b[31mSem terminal interativo — nao da para confirmar.\x1b[0m');
    console.log('  Repita com `docker exec -it` (ou rode direto no host).\n');
    return false;
  }

  const r = await confirmar('  Digite PRODUCAO para continuar: ');
  if (r !== 'PRODUCAO') {
    console.log('\n  Cancelado.\n');
    return false;
  }
  return true;
}

function cabecalho(cfg) {
  const marca = cfg.producao ? '\x1b[31mPRODUCAO\x1b[0m' : '\x1b[32mlocal\x1b[0m';
  console.log('');
  console.log(`  ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}  [${marca}]`);
  console.log(`  origem da conexao: ${cfg.origem}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------
async function cmdStatus(client, migracoes) {
  await garantirTabela(client);
  const feitas = await aplicadas(client);

  const pendentes = migracoes.filter((m) => !feitas.has(m.nome));
  const alteradas = migracoes.filter(
    (m) => feitas.has(m.nome) && feitas.get(m.nome).checksum !== m.checksum,
  );

  console.log(`  aplicadas: ${feitas.size}`);
  console.log(`  pendentes: ${pendentes.length}`);
  for (const m of pendentes) console.log(`    - ${m.nome}`);

  if (alteradas.length) {
    console.log('');
    console.log('  \x1b[33mAVISO: migracoes editadas depois de aplicadas\x1b[0m');
    for (const m of alteradas) console.log(`    ! ${m.nome}`);
    console.log('');
    console.log('  O conteudo em disco nao bate com o que rodou neste banco.');
    console.log('  Migracao ja aplicada nao se edita — corrija criando a proxima.');
  }

  // Registro orfao: esta na tabela e o arquivo sumiu. Sinal de que alguem
  // apagou ou renomeou uma migracao ja aplicada.
  const nomes = new Set(migracoes.map((m) => m.nome));
  const orfas = [...feitas.keys()].filter((v) => !nomes.has(v));
  if (orfas.length) {
    console.log('');
    console.log('  \x1b[33mAVISO: registradas sem arquivo correspondente\x1b[0m');
    for (const o of orfas) console.log(`    ? ${o}`);
  }

  console.log('');
  return pendentes.length;
}

async function cmdVerify(client, migracoes) {
  const res = await verificar(client, migracoes);
  const ausentes = res.filter((r) => r.estado === 'ausente');
  const semManifesto = res.filter((r) => r.estado === 'sem-manifesto');

  for (const r of res) {
    const icone =
      r.estado === 'presente' ? '\x1b[32mok  \x1b[0m'
      : r.estado === 'ausente' ? '\x1b[31mNAO \x1b[0m'
      : '\x1b[33m??  \x1b[0m';
    console.log(`  ${icone} ${r.nome}${r.marcador ? `   (${r.marcador})` : ''}`);
  }

  console.log('');
  if (semManifesto.length) {
    console.log(`  ${semManifesto.length} sem marcador no manifesto — adicionar em MANIFESTO.`);
  }
  if (ausentes.length) {
    console.log(`  \x1b[31m${ausentes.length} migracao(oes) nao aplicada(s) neste banco.\x1b[0m`);
    console.log('  NAO rodar baseline aqui — ele carimbaria como aplicado o que nao rodou.');
    console.log('  Aplique as que faltam primeiro.');
  } else if (!semManifesto.length) {
    console.log('  \x1b[32mSchema completo — seguro rodar baseline.\x1b[0m');
  }
  console.log('');

  // Sai diferente de zero quando ha divergencia, para que `db:verify &&
  // db:baseline` pare no primeiro. Sem isso a verificacao vira decorativa.
  if (ausentes.length || semManifesto.length) process.exitCode = 1;
  return ausentes.length;
}

async function cmdBaseline(client, migracoes, cfg) {
  await garantirTabela(client);
  const feitas = await aplicadas(client);
  const novas = migracoes.filter((m) => !feitas.has(m.nome));

  if (!novas.length) {
    console.log('  Nada a carimbar — todas ja registradas.\n');
    return;
  }

  // Barreira dupla: o baseline mente se o schema estiver incompleto, entao ele
  // roda a verificacao por conta propria antes de gravar qualquer linha.
  const ausentes = (await verificar(client, novas)).filter((r) => r.estado === 'ausente');
  if (ausentes.length) {
    console.log('  \x1b[31mBaseline abortado.\x1b[0m Estas migracoes nao estao no schema:');
    for (const a of ausentes) console.log(`    - ${a.nome}   (${a.marcador})`);
    console.log('\n  Aplique-as antes de carimbar. Rode `npm run db:verify` para o quadro completo.\n');
    process.exitCode = 1;
    return;
  }

  if (!(await exigirConfirmacao(cfg, `carimbar ${novas.length} migracao(oes) como aplicadas`))) {
    process.exitCode = 1;
    return;
  }

  for (const m of novas) {
    await client.query(
      'INSERT INTO schema_migrations (versao, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [m.nome, m.checksum],
    );
    console.log(`  carimbada  ${m.nome}`);
  }
  console.log(`\n  ${novas.length} migracao(oes) registrada(s) sem execucao.\n`);
}

async function cmdMigrate(client, migracoes, cfg) {
  await garantirTabela(client);
  const feitas = await aplicadas(client);
  const pendentes = migracoes.filter((m) => !feitas.has(m.nome));

  if (!pendentes.length) {
    console.log('  Nada pendente.\n');
    return;
  }

  console.log(`  vai aplicar ${pendentes.length}:`);
  for (const m of pendentes) console.log(`    - ${m.nome}`);
  console.log('');

  if (!(await exigirConfirmacao(cfg, `aplicar ${pendentes.length} migracao(oes)`))) {
    process.exitCode = 1;
    return;
  }

  for (const m of pendentes) {
    process.stdout.write(`  aplicando ${m.nome} ... `);
    try {
      // Uma transacao por migracao. O Postgres tem DDL transacional, entao
      // falha no meio nao deixa schema pela metade — e o registro so e gravado
      // junto, no mesmo COMMIT.
      await client.query('BEGIN');
      await client.query(m.conteudo);
      await client.query(
        'INSERT INTO schema_migrations (versao, checksum) VALUES ($1, $2)',
        [m.nome, m.checksum],
      );
      await client.query('COMMIT');
      console.log('\x1b[32mok\x1b[0m');
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('\x1b[31mFALHOU\x1b[0m');
      console.error(`\n  ${err.message}\n`);
      console.error('  Nada foi gravado desta migracao. As anteriores continuam aplicadas.');
      console.error('  Corrija o arquivo e rode de novo — ele retoma daqui.\n');
      process.exitCode = 1;
      return;
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------------
async function main() {
  const comando = process.argv[2];
  const env = lerEnv();
  const cfg = conexao(env);

  if (!cfg.user || !cfg.database) {
    console.error('\n  Sem dados de conexao: defina DATABASE_URL (ou POSTGRES_USER/POSTGRES_DB).\n');
    process.exit(1);
  }

  cfg.producao = ehProducao(env, cfg.host);

  const migracoes = listarMigracoes();
  const client = new Client(cfg.pg);

  try {
    await client.connect();
  } catch (err) {
    // err.message vem vazio em alguns ECONNREFUSED; o code sempre vem.
    const detalhe = err.message || err.code || 'motivo nao informado';
    console.error(`\n  Nao conectou em ${cfg.host}:${cfg.port}/${cfg.database} — ${detalhe}`);
    console.error(`  (conexao montada a partir de: ${cfg.origem})\n`);
    process.exit(1);
  }

  cabecalho(cfg);

  try {
    switch (comando) {
      case 'status':   await cmdStatus(client, migracoes); break;
      case 'verify':   await cmdVerify(client, migracoes); break;
      case 'baseline': await cmdBaseline(client, migracoes, cfg); break;
      case 'migrate':  await cmdMigrate(client, migracoes, cfg); break;
      default:
        console.log('  uso: node scripts/migrate.js <status|verify|baseline|migrate>\n');
        process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`\n  ${err.stack || err.message}\n`);
  process.exit(1);
});
