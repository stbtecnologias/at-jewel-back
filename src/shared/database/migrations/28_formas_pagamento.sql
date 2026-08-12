-- ============================================================
-- A.T. JEWEL — Migracao 28: Cadastro de Formas de Pagamento
--
-- Levantado na reuniao STB <> CONEXA de 11/08/2026. O ERP Safira tem
-- cadastro proprio de formas de pagamento, com ID e classificacao
-- (cartao, boleto, dinheiro, PIX...). O CRM tinha apenas o ENUM
-- `forma_pagamento`, criado na migracao 09 com 8 valores fixos.
--
-- O QUE ESTA MIGRACAO FAZ — E O QUE NAO FAZ:
--   Cria APENAS o catalogo. `pagamentos_venda.forma_pagamento`
--   continua sendo o ENUM e continua funcionando exatamente como
--   antes. Nada muda para a aplicacao.
--
--   Trocar aquela coluna por uma FK e mudanca DESTRUTIVA: a
--   ingestao de venda grava o ENUM e quebraria no mesmo instante.
--   Vai fatiada, em migracoes proprias, com deploys no meio:
--     1. adiciona forma_pagamento_id nullable ao lado da coluna atual
--     2. codigo passa a gravar nas duas
--     3. preenche o historico
--     4. codigo passa a ler so da nova
--     5. remove a antiga
--   Ver [[Aplicar migração de banco]] no Obsidian.
--
-- POR QUE `classificacao` REUSA O ENUM:
--   O ENUM `forma_pagamento` vira a classificacao de cada forma
--   cadastrada. Isso preserva /analytics/distribuicao-pagamento, que
--   agrupa por aqueles 8 valores — o relatorio continua funcionando
--   enquanto a granularidade nova (a forma especifica do ERP) entra
--   por baixo. Sem isso, adotar o cadastro exigiria reescrever o
--   analytics no mesmo dia.
--
-- ATENCAO AO MAPEAR:
--   Alessandro trata PIX, TED e DOC como a mesma coisa ("no frigir
--   dos ovos vai cair do mesmo jeito"). O ENUM atual separa 'pix' de
--   'transferencia'. O de-para precisa ser explicito na ingestao,
--   senao a distribuicao por forma de pagamento muda de leitura sem
--   ninguem perceber.
--
-- Sem CREATE TYPE — reaproveita o ENUM da migracao 09. Integralmente
-- re-executavel. Aditiva/idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS formas_pagamento (
  -- [SYS] Identificador interno.
  id             UUID            PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [ERP] Codigo da forma no ERP Safira. Chave de idempotencia.
  codigo_erp     VARCHAR(50)     UNIQUE,

  -- [ERP] Nome como cadastrado no ERP. Ex.: "Cartao Visa 3x",
  -- "Boleto 30 dias", "PIX". E a granularidade que hoje se perde.
  nome           VARCHAR(100)    NOT NULL,

  -- [SYS] Classificacao — o ENUM que ja existe. E a ponte com o que
  -- esta gravado hoje em pagamentos_venda e com o analytics.
  -- Ex.: nome "Cartao Visa 3x" -> classificacao 'cartao_credito'.
  classificacao  forma_pagamento NOT NULL,

  -- [SYS] Desligamento suave. Forma desativada some da selecao, mas
  -- as vendas historicas que a usaram continuam intactas.
  ativo          BOOLEAN         NOT NULL DEFAULT TRUE,

  -- [SYS] Auditoria minima.
  criado_em      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Lookup por codigo ERP — idempotencia da sincronizacao.
CREATE INDEX IF NOT EXISTS idx_formas_pagamento_codigo_erp
  ON formas_pagamento(codigo_erp)
  WHERE codigo_erp IS NOT NULL;

-- Agrupamento por classificacao — preserva o predicado do
-- /analytics/distribuicao-pagamento quando ele migrar para a FK.
CREATE INDEX IF NOT EXISTS idx_formas_pagamento_classificacao
  ON formas_pagamento(classificacao)
  WHERE ativo = TRUE;


-- ------------------------------------------------------------
-- Permissoes granulares (RF-USU-01). SUPERADMIN ja possui '*'.
--
-- Cadastro estrutural e de baixa rotatividade: leitura ampla (toda
-- tela de venda precisa exibir a forma), escrita restrita a gestao.
-- ------------------------------------------------------------
INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',      'formas_pagamento:read'), ('ADMIN',   'formas_pagamento:write'),
  ('GERENTE',    'formas_pagamento:read'), ('GERENTE', 'formas_pagamento:write'),
  ('ESTOQUISTA', 'formas_pagamento:read'),
  ('VENDEDORA',  'formas_pagamento:read')
ON CONFLICT DO NOTHING;
