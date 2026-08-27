/**
 * SEED DE DEMONSTRACAO — atendimentos de hoje e de ontem.
 *
 * =====================================================================
 * SOMENTE AMBIENTE LOCAL. Insere gente que nao existe, conversa que nao
 * aconteceu e venda que ninguem fez. Rodar isto em producao poe dado
 * ficticio no meio do real, e daqui a um mes ninguem distingue.
 * =====================================================================
 *
 * POR QUE E JAVASCRIPT, E NAO .sql COMO O `dev_seed`:
 *
 * `atendimento_interacoes.relato` e uma coluna CIFRADA (AES-256-GCM, pela
 * ENCRYPTION_KEY). SQL cru so consegue gravar texto puro — e o ORM, ao ler,
 * devolveria `null`, porque o texto nao casa com o formato do ciphertext.
 *
 * O resultado seria a tela de auditoria inteira dizendo "Nenhum feedback
 * registrado ainda" — justamente o campo que a tela existe para mostrar.
 * Entao o relato e cifrado aqui, com o mesmo algoritmo do
 * `encrypted-column.transformer.ts`.
 *
 * ADITIVO E IDEMPOTENTE: nao apaga nada que nao seja dele. Os atendimentos
 * tem UUID FIXO (prefixo `decafbad`), entao rodar de novo remove os anteriores
 * pelo id e recria — sem tocar em nenhum outro registro.
 *
 * Rodar:
 *   node src/shared/database/seeds/demo_atendimentos.js
 *
 * Desfazer:
 *   node src/shared/database/seeds/demo_atendimentos.js --limpar
 */

const path = require('path');
const { createCipheriv, randomBytes } = require('crypto');
const { Client } = require('pg');

require('dotenv').config({
  path: path.join(__dirname, '..', '..', '..', '..', '.env'),
  quiet: true,
});

// --------------------------------------------------------------------
// Cifra igual a do projeto. Formato: "v1:<iv>:<authTag>:<ciphertext>".
// --------------------------------------------------------------------
function cifrar(texto) {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY ausente ou fora do formato (64 hex).');
  }
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), iv);
  const dados = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${dados.toString('hex')}`;
}

/**
 * UUID fixo, com marca visivel: `decafbad` na frente diz "isto e do seed".
 *
 * Tem que ser HEXADECIMAL — a primeira versao usava `dem0`, e o `m` fez o
 * Postgres recusar o uuid inteiro. `decafbad` so tem d, e, c, a, f, b.
 */
const id = (n) => `decafbad-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Hoje as HH:MM no fuso local da maquina. */
function hoje(hh, mm) {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d;
}
function ontem(hh, mm) {
  const d = hoje(hh, mm);
  d.setDate(d.getDate() - 1);
  return d;
}
const minutosAtras = (n) => new Date(Date.now() - n * 60_000);

// --------------------------------------------------------------------
// OS CENARIOS.
//
// Cada um existe para acender UMA parte da tela. A etapa nao e escolhida:
// ela e CALCULADA pela view a partir das interacoes (migracao 38), entao o
// que esta aqui e a linha do tempo que PRODUZ a etapa desejada.
// --------------------------------------------------------------------
const CENARIOS = [
  // ---------- HOJE ----------
  {
    n: 1,
    quando: hoje(9, 12),
    ocasiao: 'NOIVADO',
    desfecho: 'VENDA',
    fechado: hoje(11, 40),
    // desfecho VENDA -> CONCLUIDO
    interacoes: [
      { tipo: 'ENCAMINHADO', em: hoje(9, 12) },
      {
        tipo: 'RELATO',
        em: hoje(11, 38),
        relato:
          'Fechou o solitário de 30 pontos. Ela veio com o noivo, os dois já tinham visto no Instagram. Levou também um par de brincos para a mãe dela.',
      },
    ],
  },
  {
    n: 2,
    quando: hoje(9, 40),
    ocasiao: 'CASAMENTO',
    // ultimo = RELATO -> EM_NEGOCIACAO
    interacoes: [
      { tipo: 'ENCAMINHADO', em: hoje(9, 40) },
      {
        tipo: 'RELATO',
        em: hoje(10, 55),
        relato:
          'Gostou muito das alianças de ouro branco, mas quer conversar com o noivo antes de decidir. Pediu para eu guardar o par 6mm até sexta.',
      },
      { tipo: 'COBRANCA', em: null, notificar: hoje(17, 0), combinado: hoje(16, 0), status: 'PENDENTE' },
    ],
  },
  {
    n: 3,
    quando: hoje(8, 30),
    ocasiao: 'ANIVERSARIO',
    // ultimo = REAGENDAMENTO -> REMARCADO
    interacoes: [
      { tipo: 'ENCAMINHADO', em: hoje(8, 30) },
      {
        tipo: 'RELATO',
        em: hoje(9, 5),
        relato: 'Estava em reunião, pediu para ligar mais tarde.',
      },
      { tipo: 'REAGENDAMENTO', em: hoje(9, 6), combinado: hoje(16, 30) },
      { tipo: 'LEMBRETE', em: null, notificar: hoje(16, 15), combinado: hoje(16, 30), status: 'PENDENTE' },
    ],
  },
  {
    n: 4,
    quando: hoje(8, 5),
    ocasiao: 'DATA_COMEMORATIVA',
    // COBRANCA de retomada (sem combinado_em) e ABERTA -> SEM_CONTATO
    interacoes: [
      { tipo: 'ENCAMINHADO', em: hoje(8, 5) },
      {
        tipo: 'RELATO',
        em: hoje(9, 30),
        relato: 'Liguei duas vezes e mandei mensagem, não retornou até agora.',
      },
      { tipo: 'COBRANCA', em: null, notificar: hoje(14, 0), combinado: null, status: 'ENVIADA' },
    ],
  },
  {
    n: 5,
    quando: minutosAtras(18),
    ocasiao: 'AUTOPRESENTE',
    // so ENCAMINHADO -> PRIMEIRO_CONTATO. E o "chegou agora" da tela.
    interacoes: [{ tipo: 'ENCAMINHADO', em: minutosAtras(18) }],
  },
  {
    n: 6,
    quando: hoje(7, 50),
    ocasiao: 'CASAMENTO',
    // COBRANCA AGUARDANDO_RESPOSTA -> acende o numero vermelho do topo
    interacoes: [
      { tipo: 'ENCAMINHADO', em: hoje(7, 50) },
      { tipo: 'LEMBRETE', em: hoje(9, 45), combinado: hoje(10, 0), status: 'ENVIADA' },
      {
        tipo: 'COBRANCA',
        em: hoje(11, 0),
        notificar: hoje(11, 0),
        combinado: hoje(10, 0),
        status: 'AGUARDANDO_RESPOSTA',
      },
    ],
  },
  {
    n: 7,
    quando: hoje(10, 20),
    ocasiao: 'FORMATURA',
    desfecho: 'VENDA',
    fechado: hoje(12, 15),
    interacoes: [
      { tipo: 'ENCAMINHADO', em: hoje(10, 20) },
      {
        tipo: 'RELATO',
        em: hoje(12, 10),
        relato:
          'Levou a gargantilha de pérolas e o anel que combinava. Falou que volta em dezembro para o presente do filho.',
      },
    ],
  },
  {
    n: 8,
    quando: hoje(10, 45),
    ocasiao: 'OUTRO',
    interacoes: [
      { tipo: 'ENCAMINHADO', em: hoje(10, 45) },
      {
        tipo: 'RELATO',
        em: hoje(11, 25),
        relato:
          'Quer trocar a pedra do anel da avó por uma esmeralda. Vou levar para a oficina avaliar e retorno na sexta com o orçamento.',
      },
      { tipo: 'COBRANCA', em: null, notificar: hoje(18, 0), combinado: hoje(17, 0), status: 'PENDENTE' },
    ],
  },
  {
    n: 9,
    quando: hoje(11, 5),
    ocasiao: 'ANIVERSARIO',
    desfecho: 'SEM_VENDA',
    fechado: hoje(12, 0),
    // desfecho SEM_VENDA -> NAO_AVANCOU
    interacoes: [
      { tipo: 'ENCAMINHADO', em: hoje(11, 5) },
      {
        tipo: 'RELATO',
        em: hoje(11, 58),
        relato:
          'Achou o preço acima do que esperava e disse que vai deixar para o ano que vem. Não insisti.',
      },
    ],
  },

  // ---------- ONTEM (para a aba "Esta semana" ter mais de um dia) ----------
  {
    n: 10,
    quando: ontem(9, 30),
    ocasiao: 'NOIVADO',
    desfecho: 'VENDA',
    fechado: ontem(15, 20),
    interacoes: [
      { tipo: 'ENCAMINHADO', em: ontem(9, 30) },
      {
        tipo: 'RELATO',
        em: ontem(15, 15),
        relato: 'Fechou o anel de noivado. Pediu gravação por dentro, fica pronto quinta.',
      },
    ],
  },
  {
    n: 11,
    quando: ontem(14, 10),
    ocasiao: 'DATA_COMEMORATIVA',
    interacoes: [
      { tipo: 'ENCAMINHADO', em: ontem(14, 10) },
      {
        tipo: 'RELATO',
        em: ontem(16, 40),
        relato: 'Está entre dois modelos de pulseira. Mandei foto dos dois no WhatsApp dela.',
      },
    ],
  },
  {
    n: 12,
    quando: ontem(16, 0),
    ocasiao: 'CASAMENTO',
    interacoes: [
      { tipo: 'ENCAMINHADO', em: ontem(16, 0) },
      { tipo: 'REAGENDAMENTO', em: ontem(16, 30), combinado: hoje(15, 0) },
      { tipo: 'LEMBRETE', em: null, notificar: hoje(14, 45), combinado: hoje(15, 0), status: 'PENDENTE' },
    ],
  },
];

async function main() {
  const limpar = process.argv.includes('--limpar');

  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  });
  await client.connect();

  const ids = CENARIOS.map((c) => id(c.n));

  // TUDO OU NADA. Sem transacao, uma constraint recusada no meio deixa metade
  // dos cenarios gravados — foi o que aconteceu na primeira execucao, e a tela
  // ficaria mostrando um dia pela metade sem ninguem perceber.
  await client.query('BEGIN');

  // ON DELETE CASCADE em atendimento_interacoes leva as interacoes junto.
  const { rowCount: removidos } = await client.query(
    'DELETE FROM atendimentos WHERE id = ANY($1::uuid[])',
    [ids],
  );
  if (removidos > 0) console.log(`removidos ${removidos} atendimento(s) do seed anterior`);

  if (limpar) {
    await client.query('COMMIT');
    console.log('pronto — nada foi inserido (--limpar)');
    await client.end();
    return;
  }

  // Gente que JA existe na base. O seed nao cria cliente nem vendedora: ele
  // encena um episodio entre pessoas que ja estao la.
  // NOMES DISTINTOS E ESPALHADOS PELA BASE. `ORDER BY nome LIMIT 12` trazia as
  // doze primeiras em ordem alfabetica — e saiam "Ana Silva, Ana Martins, Ana
  // Martins...". Numa tela de demonstracao isso parece defeito.
  //
  // `DISTINCT ON (nome)` mata a homonima; `md5(id)` embaralha de forma
  // DETERMINISTICA, entao roda de novo e vem a mesma gente.
  //
  // E SO CLIENTE SEM EPISODIO ABERTO. O indice parcial
  // `uq_atendimento_aberto_por_cliente` garante no maximo UM atendimento aberto
  // por cliente — e a base ja tem os de 19 a 24/08 em curso. Sortear sem esse
  // filtro derruba o seed com violacao de unicidade.
  const { rows: clientes } = await client.query(
    `SELECT id, nome FROM (
       SELECT DISTINCT ON (nome) id, nome FROM clientes ORDER BY nome, id
     ) t
     WHERE NOT EXISTS (
       SELECT 1 FROM atendimentos a
        WHERE a.cliente_id = t.id AND a.fechado_em IS NULL
     )
     -- Fora os clientes de teste da base ("Teste Codigo ERP" e afins): numa
     -- tela que alguem vai apresentar, esse nome no meio parece defeito.
     AND t.nome !~* '(teste|test|xxx|abc)'
     ORDER BY md5(t.id::text) LIMIT $1`,
    [CENARIOS.length],
  );
  const { rows: vendedoras } = await client.query(
    'SELECT id, nome, codigo_erp FROM vendedoras WHERE ativo ORDER BY nome',
  );

  if (clientes.length < CENARIOS.length || vendedoras.length === 0) {
    throw new Error(
      `Base sem gente suficiente: ${clientes.length} clientes, ${vendedoras.length} vendedoras.`,
    );
  }

  for (const [i, c] of CENARIOS.entries()) {
    const cliente = clientes[i];
    // Espalha entre as vendedoras para a coluna da equipe nao ficar com uma so.
    const vendedora = vendedoras[i % vendedoras.length];

    await client.query(
      `INSERT INTO atendimentos
         (id, cliente_id, vendedora_id, ocasiao, aberto_em, fechado_em, desfecho, criado_em, atualizado_em)
       VALUES ($1, $2, $3, $4::ocasiao_atendimento, $5, $6, $7::desfecho_atendimento, $5, now())`,
      [id(c.n), cliente.id, vendedora.id, c.ocasiao, c.quando, c.fechado ?? null, c.desfecho ?? null],
    );

    for (const it of c.interacoes) {
      // RELATO e NOTA nascem CONCLUIDA — ja aconteceram. As demais carregam
      // o status do cenario.
      const status = it.status ?? 'CONCLUIDA';

      // `chk_interacao_agendada`: LEMBRETE e COBRANCA EXIGEM `notificar_em` —
      // sem horario nao ha o que disparar. Um lembrete que ja saiu tem o
      // disparo no mesmo instante em que ocorreu, entao o `em` serve.
      const agendavel = it.tipo === 'LEMBRETE' || it.tipo === 'COBRANCA';
      const notificar = it.notificar ?? (agendavel ? it.em : null);
      if (agendavel && !notificar) {
        throw new Error(`Cenario ${c.n}: ${it.tipo} sem notificar_em nem ocorrido_em.`);
      }
      await client.query(
        `INSERT INTO atendimento_interacoes
           (atendimento_id, tipo, combinado_em, notificar_em, ocorrido_em, status, relato, criado_em, atualizado_em)
         VALUES ($1, $2::tipo_interacao, $3, $4, $5, $6::status_interacao, $7, COALESCE($5, $4, now()), now())`,
        [
          id(c.n),
          it.tipo,
          it.combinado ?? null,
          notificar,
          it.em ?? null,
          status,
          it.relato ? cifrar(it.relato) : null,
        ],
      );
    }
  }

  await client.query('COMMIT');

  const { rows: conferencia } = await client.query(
    `SELECT etapa, COUNT(*)::int AS n
       FROM vw_atendimentos_auditoria
      WHERE id = ANY($1::uuid[])
      GROUP BY etapa ORDER BY 1`,
    [ids],
  );
  const { rows: fila } = await client.query(
    `SELECT COUNT(*)::int AS n FROM vw_atendimentos_auditoria
      WHERE id = ANY($1::uuid[]) AND aguardando_relato`,
    [ids],
  );

  console.log(`\n${CENARIOS.length} atendimentos inseridos.`);
  console.log('etapas calculadas pela view:');
  for (const r of conferencia) console.log(`  ${r.etapa.padEnd(18)} ${r.n}`);
  console.log(`  ${'aguardando feedback'.padEnd(18)} ${fila[0].n}`);

  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
