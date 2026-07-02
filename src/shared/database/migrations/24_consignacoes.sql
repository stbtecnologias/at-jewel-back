-- ============================================================
-- A.T. JEWEL — Migracao 24: Consignacoes (RF-13 / RF-14)
--
-- Controle de pecas consignadas (em posse temporaria de um
-- cliente ou de uma vendedora, ainda sem venda fechada). Cada
-- registro representa uma saida de N unidades de um produto que
-- deve retornar (DEVOLVIDA) ou converter em venda (VENDIDA).
--
-- Origem: [SYS] — dado operacional do sistema novo, nao vem do
-- ERP Safira. Sem PII propria: cliente/vendedora entram apenas
-- por FK; nome/telefone permanecem nas tabelas de origem.
--
-- LGPD: as FKs cliente_id/vendedora_id usam ON DELETE SET NULL,
-- e criado_por tambem. Apagar um cliente/vendedora (direito ao
-- esquecimento) ou um usuario admin NAO destroi o historico de
-- movimentacao de estoque — o vinculo cai, o registro fica.
--
-- Estilo alinhado a 09_vendas.sql / 15_defeitos.sql: sem trigger
-- de updated_at (a camada de aplicacao mantem atualizado_em via
-- TypeORM @UpdateDateColumn). destino_tipo/status usam TEXT + CHECK
-- (nao ENUM) para simplificar evolucao dos valores.
-- Aditiva/idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS consignacoes (
  -- [SYS] Identificador interno.
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [SYS] Produto consignado. RESTRICT implicito nao se aplica —
  -- usamos a FK padrao; ver ON DELETE abaixo.
  produto_id             UUID        NOT NULL REFERENCES produtos(id),

  -- [SYS] Quantidade de pecas fora da loja. Sempre positiva.
  quantidade             INT         NOT NULL CHECK (quantidade > 0),

  -- [SYS] Para quem a peca foi consignada.
  destino_tipo           TEXT        NOT NULL CHECK (destino_tipo IN ('CLIENTE', 'VENDEDORA')),

  -- [SYS] Cliente detentor (quando destino_tipo = 'CLIENTE').
  -- SET NULL preserva o historico se o cliente for apagado (LGPD).
  cliente_id             UUID        REFERENCES clientes(id) ON DELETE SET NULL,

  -- [SYS] Vendedora detentora (quando destino_tipo = 'VENDEDORA').
  -- SET NULL preserva o historico se a vendedora for desligada.
  vendedora_id           UUID        REFERENCES vendedoras(id) ON DELETE SET NULL,

  -- [SYS] Situacao da consignacao.
  --   ABERTA    = pecas ainda em posse do detentor
  --   DEVOLVIDA = pecas retornaram a loja
  --   VENDIDA   = consignacao convertida em venda
  status                 TEXT        NOT NULL DEFAULT 'ABERTA'
                                     CHECK (status IN ('ABERTA', 'DEVOLVIDA', 'VENDIDA')),

  -- [SYS] Quando as pecas sairam. Base das consultas por periodo.
  data_saida             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- [SYS] Data combinada para retorno (apenas data, sem hora).
  data_prevista_retorno  DATE,

  -- [SYS] Quando as pecas efetivamente retornaram/converteram.
  -- Preenchido ao mudar status para DEVOLVIDA/VENDIDA.
  data_retorno           TIMESTAMPTZ,

  -- [SYS] Observacao operacional livre (ex: condicoes da prova).
  -- Nao logar o conteudo. Sanitizado na camada de aplicacao.
  observacao             TEXT,

  -- [SYS] Usuario admin que registrou a consignacao. SET NULL na
  -- exclusao do usuario (preserva o registro operacional).
  criado_por             UUID        REFERENCES admin_users(id) ON DELETE SET NULL,

  -- [SYS] Auditoria minima.
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Coerencia destino <-> id: destino CLIENTE exige cliente_id (e
  -- proibe vendedora_id); destino VENDEDORA exige vendedora_id (e
  -- proibe cliente_id). Espelha a validacao da camada de aplicacao.
  CONSTRAINT chk_consignacao_destino CHECK (
    (destino_tipo = 'CLIENTE'   AND cliente_id   IS NOT NULL AND vendedora_id IS NULL) OR
    (destino_tipo = 'VENDEDORA' AND vendedora_id IS NOT NULL AND cliente_id   IS NULL)
  )
);

-- Filtro por situacao — a tela lista majoritariamente as ABERTAS.
CREATE INDEX IF NOT EXISTS idx_consignacoes_status
  ON consignacoes(status);

-- Consignacoes de um produto — visao de onde esta cada peca.
CREATE INDEX IF NOT EXISTS idx_consignacoes_produto
  ON consignacoes(produto_id);

-- Consignacoes por vendedora — o que cada vendedora tem em posse.
CREATE INDEX IF NOT EXISTS idx_consignacoes_vendedora
  ON consignacoes(vendedora_id)
  WHERE vendedora_id IS NOT NULL;

-- Consignacoes por cliente — o que cada cliente levou para prova.
CREATE INDEX IF NOT EXISTS idx_consignacoes_cliente
  ON consignacoes(cliente_id)
  WHERE cliente_id IS NOT NULL;


-- ------------------------------------------------------------
-- Permissoes granulares (RF-USU-01). SUPERADMIN ja possui '*'.
-- Segue o padrao de seed incremental da migracao 22: novas chaves
-- do catalogo sao concedidas aos papeis pertinentes via INSERT
-- idempotente. O catalogo canonico em codigo fica em
-- src/modules/auth/domain/permissions.ts.
--   consignacoes:read  -> gestao, estoque e vendedora
--   consignacoes:write -> gestao e estoque (registram saidas/retornos)
-- ------------------------------------------------------------
INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',      'consignacoes:read'),  ('ADMIN',      'consignacoes:write'),
  ('GERENTE',    'consignacoes:read'),  ('GERENTE',    'consignacoes:write'),
  ('ESTOQUISTA', 'consignacoes:read'),  ('ESTOQUISTA', 'consignacoes:write'),
  ('VENDEDORA',  'consignacoes:read')
ON CONFLICT DO NOTHING;
