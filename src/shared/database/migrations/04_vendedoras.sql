-- ============================================================
-- A.T. JEWEL — Migracao 04: Entidade Vendedora
--
-- Modela as vendedoras da loja. Bloqueador resolvido para:
--   1. FK formal em `clientes.vendedora_codigo_erp`
--   2. Algoritmo de matching da Anastasia (RF06 dos requisitos)
--   3. Roteamento com aprovacao (Workflow 02)
--
-- Campos sensiveis (email, whatsapp) sao cifrados em AES-256-GCM
-- pela mesma regra aplicada em `clientes`. Vendedora e PF — PII
-- merece o mesmo tratamento que cliente.
--
-- Metricas de performance (conversao, ticket medio, tempo de
-- fechamento, taxa de recompra) NAO sao colunas desta tabela.
-- Serao computadas em VIEW MATERIALIZADA quando a tabela `vendas`
-- existir (S6). Razoes:
--   - Calcular em tempo real cada query e custoso
--   - Materializar permite snapshot consistente para relatorios
--   - Refresh diario e suficiente para o algoritmo de matching
-- ============================================================


-- ------------------------------------------------------------
-- ENUMs
-- ------------------------------------------------------------

-- Tipo de vendedora conforme estrutura comercial da A.T. Jewel.
-- LOCAL    = vendedora na loja fisica
-- EXTERNA  = vendedora que atende fora da loja (representante)
-- GERENTE  = Faby Lima e cargos equivalentes
CREATE TYPE tipo_vendedora AS ENUM ('LOCAL', 'EXTERNA', 'GERENTE');

-- Status operacional da vendedora — usado pelo algoritmo de matching
-- da Anastasia para evitar sugerir quem nao pode atender no momento.
-- DISPONIVEL = pode receber novos clientes
-- OCUPADA    = em atendimento ativo, fila cheia
-- AUSENTE    = ausente curto prazo (almoco, folga, doente)
-- FERIAS     = ausente longo prazo (ferias, licenca)
CREATE TYPE status_disponibilidade_vendedora AS ENUM ('DISPONIVEL', 'OCUPADA', 'AUSENTE', 'FERIAS');


-- ------------------------------------------------------------
-- Tabela: vendedoras
--
-- Origem hibrida: dados cadastrais vem do ERP Safira; metricas
-- de matching e status de disponibilidade sao do sistema novo.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendedoras (
  -- [SYS] Identificador interno, desacoplado do ERP.
  id                            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [ERP] Codigo da vendedora no ERP Safira. Permite mapear
  -- `clientes.vendedora_codigo_erp` (sincronizado do ERP) para
  -- o registro local da vendedora.
  codigo_erp                    VARCHAR(50)  UNIQUE,

  -- [ERP] Nome completo da vendedora. Nao e considerado dado
  -- altamente sensivel — vendedoras se identificam publicamente
  -- ao cliente. Mantido em plaintext para busca operacional.
  nome                          VARCHAR(255) NOT NULL,

  -- [ERP] Tipo conforme estrutura comercial.
  tipo                          tipo_vendedora NOT NULL DEFAULT 'LOCAL',

  -- [SYS] Soft-disable. Vendedora desligada nao aparece em
  -- matching nem em listagens operacionais.
  ativo                         BOOLEAN      NOT NULL DEFAULT TRUE,

  -- [SYS] Status operacional. Anastasia consulta este campo no
  -- algoritmo de matching para filtrar quem pode atender agora.
  status_disponibilidade        status_disponibilidade_vendedora NOT NULL DEFAULT 'DISPONIVEL',

  -- [SYS] Especialidades de estilo da vendedora. Array livre para
  -- crescer conforme o catalogo evolui. Exemplos esperados:
  -- 'classico', 'contemporaneo', 'statement', 'minimalista',
  -- 'noivado', 'pedras-coloridas'. Usado no matching cliente x vendedora.
  especialidades                TEXT[]       NOT NULL DEFAULT '{}',

  -- [ENCRYPTED] Email da vendedora. PII tratada com mesmo rigor
  -- aplicado em `clientes`. Necessario para notificacoes internas
  -- (ex: nova atribuicao de cliente).
  email                         TEXT,

  -- [HASH] HMAC-SHA256 do email normalizado. Permite busca
  -- (ex: convite por email) sem decifrar a base inteira.
  email_hash                    VARCHAR(64)  UNIQUE,

  -- [ENCRYPTED] Numero WhatsApp interno usado para receber
  -- handoffs da Anastasia e consultas a Elena. Cifrado por
  -- ser canal direto de contato pessoal da vendedora.
  whatsapp_interno              TEXT,

  -- [HASH] HMAC-SHA256 do WhatsApp normalizado (so digitos).
  -- Permite identificar a vendedora pelo numero em webhooks
  -- do Chatwoot sem decifragem.
  whatsapp_interno_hash         VARCHAR(64)  UNIQUE,

  -- [SYS] Vinculo opcional com conta administrativa. Vendedoras
  -- que acessam o dashboard CRM tem um `admin_user` associado;
  -- vendedoras que so usam WhatsApp interno nao tem.
  admin_user_id                 UUID         REFERENCES admin_users(id) ON DELETE SET NULL,

  -- [SYS] Auditoria minima.
  criado_em                     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em                 TIMESTAMPTZ  NOT NULL DEFAULT now()
);


-- Indice principal de matching: a Anastasia filtra vendedoras
-- ativas e disponiveis ao sugerir. Indice composto cobre o
-- predicado tipico `WHERE ativo = TRUE AND status_disponibilidade = 'DISPONIVEL'`.
CREATE INDEX IF NOT EXISTS idx_vendedoras_matching
  ON vendedoras(ativo, status_disponibilidade)
  WHERE ativo = TRUE;

-- Lookup por codigo ERP — usado tanto para sincronizacao do
-- Safira quanto para resolver a FK informal de `clientes`.
CREATE INDEX IF NOT EXISTS idx_vendedoras_codigo_erp
  ON vendedoras(codigo_erp)
  WHERE codigo_erp IS NOT NULL;

-- Indice nos hashes para lookups de PII sem decifragem.
CREATE INDEX IF NOT EXISTS idx_vendedoras_email_hash
  ON vendedoras(email_hash)
  WHERE email_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendedoras_whatsapp_hash
  ON vendedoras(whatsapp_interno_hash)
  WHERE whatsapp_interno_hash IS NOT NULL;

-- Indice GIN para query por especialidade.
-- Ex: SELECT * FROM vendedoras WHERE especialidades @> ARRAY['classico'];
CREATE INDEX IF NOT EXISTS idx_vendedoras_especialidades
  ON vendedoras USING GIN (especialidades);
