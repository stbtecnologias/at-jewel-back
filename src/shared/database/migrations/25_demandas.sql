-- ============================================================
-- A.T. JEWEL — Migracao 25: Demandas (RF-24 / RF-25 / RF-26)
--
-- Canal de solicitacoes internas: qualquer usuaria (proprietaria,
-- gerente, vendedora, estoquista) abre uma demanda para a equipe
-- tecnica (STB) — pedido de relatorio novo, ajuste no sistema,
-- duvida ou outro. As demandas podem nascer MANUALMENTE (tela) ou
-- via ASSISTENTE (a Anastasia registra quando nao resolve na
-- conversa). A gerencia acompanha status e resposta.
--
-- Origem: [SYS] — dado operacional do sistema novo, nao vem do
-- ERP Safira. solicitante_user_id referencia admin_users (staff),
-- nao cliente: nao ha PII de cliente aqui. solicitante_nome e um
-- rotulo denormalizado (nome/email da usuaria) preservado para
-- historico mesmo apos o vinculo cair.
--
-- LGPD: solicitante_user_id usa ON DELETE SET NULL — apagar uma
-- usuaria (direito ao esquecimento) NAO destroi o historico de
-- demandas; o vinculo cai, o registro permanece com o rotulo.
-- descricao/resposta sao texto operacional livre: nao logar o
-- conteudo (sanitizado na camada de aplicacao).
--
-- Estilo alinhado a 24_consignacoes.sql: sem trigger de updated_at
-- (a camada de aplicacao mantem updated_at via TypeORM
-- @UpdateDateColumn). canal/tipo/status usam TEXT + CHECK (nao ENUM)
-- para simplificar evolucao dos valores. Aditiva/idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS demandas (
  -- [SYS] Identificador interno.
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [SYS] Usuaria (staff) que abriu a demanda. SET NULL na exclusao
  -- do usuario preserva o registro operacional (LGPD).
  solicitante_user_id   UUID        REFERENCES admin_users(id) ON DELETE SET NULL,

  -- [SYS] Rotulo denormalizado de quem abriu (nome ou email). NOT NULL:
  -- sobrevive a exclusao do usuario para manter o historico legivel.
  solicitante_nome      TEXT        NOT NULL,

  -- [SYS] Como a demanda nasceu.
  --   MANUAL     = usuaria registrou pela tela de demandas
  --   ASSISTENTE = a Anastasia registrou durante uma conversa
  canal                 TEXT        NOT NULL DEFAULT 'MANUAL'
                                    CHECK (canal IN ('ASSISTENTE', 'MANUAL')),

  -- [SYS] Natureza da solicitacao.
  tipo                  TEXT        NOT NULL
                                    CHECK (tipo IN ('RELATORIO', 'AJUSTE', 'DUVIDA', 'OUTRO')),

  -- [SYS] Descricao livre do que a usuaria precisa. Nao logar.
  descricao             TEXT        NOT NULL,

  -- [SYS] Situacao do atendimento.
  --   ABERTA       = registrada, aguardando triagem da equipe
  --   EM_ANDAMENTO = equipe trabalhando
  --   CONCLUIDA    = resolvida (carimba concluida_em)
  --   CANCELADA    = descartada
  status                TEXT        NOT NULL DEFAULT 'ABERTA'
                                    CHECK (status IN ('ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')),

  -- [SYS] Resposta/retorno da equipe tecnica. Nao logar.
  resposta              TEXT,

  -- [SYS] Quando a demanda foi concluida. Preenchido ao mudar
  -- status para CONCLUIDA (se ainda nulo). Base do tempo medio.
  concluida_em          TIMESTAMPTZ,

  -- [SYS] Auditoria minima.
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Filtro por situacao — a tela lista majoritariamente as ABERTAS.
CREATE INDEX IF NOT EXISTS idx_demandas_status
  ON demandas(status);

-- Filtro por natureza da solicitacao.
CREATE INDEX IF NOT EXISTS idx_demandas_tipo
  ON demandas(tipo);

-- Recorte temporal (listagem por periodo, ordenacao recente).
CREATE INDEX IF NOT EXISTS idx_demandas_created_at
  ON demandas(created_at);


-- ------------------------------------------------------------
-- Permissoes granulares (RF-USU-01). SUPERADMIN (equipe STB) ja
-- possui '*'. Segue o padrao de seed incremental da migracao 24:
-- novas chaves do catalogo sao concedidas aos papeis pertinentes
-- via INSERT idempotente. O catalogo canonico em codigo fica em
-- src/modules/auth/domain/permissions.ts.
--   demandas:read   -> toda usuaria (abre/acompanha as demandas)
--   demandas:write  -> toda usuaria (registra novas demandas)
--   demandas:manage -> apenas gestao (responde/muda status)
-- ------------------------------------------------------------
INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',      'demandas:read'),  ('ADMIN',      'demandas:write'),  ('ADMIN',      'demandas:manage'),
  ('GERENTE',    'demandas:read'),  ('GERENTE',    'demandas:write'),  ('GERENTE',    'demandas:manage'),
  ('VENDEDORA',  'demandas:read'),  ('VENDEDORA',  'demandas:write'),
  ('ESTOQUISTA', 'demandas:read'),  ('ESTOQUISTA', 'demandas:write')
ON CONFLICT DO NOTHING;
