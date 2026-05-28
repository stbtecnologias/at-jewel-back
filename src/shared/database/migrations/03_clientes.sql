-- ============================================================
-- A.T. JEWEL — Migração 03: Entidade Cliente
-- Redesenhada com foco em privacidade (LGPD, Art. 6º, III)
-- e criptografia em nível de aplicação (AES-256-GCM).
--
-- Arquitetura de duas tabelas:
--   clientes         → dados operacionais / vindos do ERP
--   clientes_perfil  → dados coletados pela IA (triagem, agente)
--
-- Campos sensíveis são armazenados criptografados (TEXT).
-- A aplicação é responsável por cifrar antes de persistir
-- e decifrar após ler — o banco nunca vê o valor em claro.
--
-- Colunas de hash (_hash) usam HMAC-SHA256 truncado a 64 hex
-- para permitir buscas por igualdade sem descriptografar.
-- ============================================================


-- ------------------------------------------------------------
-- ENUMs
-- ------------------------------------------------------------

-- Pessoa física vs. pessoa jurídica (origem ERP Safira)
CREATE TYPE tipo_pessoa AS ENUM ('fisica', 'juridica');

-- Tabela de preço negociada com o cliente
CREATE TYPE tabela_preco AS ENUM ('varejo', 'atacado', 'especial', 'funcionario');

-- Contexto de compra declarado na triagem pela Anastasia
CREATE TYPE tipo_compra AS ENUM ('pessoal', 'presente');

-- Urgência da compra declarada na triagem
CREATE TYPE urgencia_compra AS ENUM ('imediata', 'proximas_semanas', 'sem_pressa');

-- Grau de familiaridade do cliente com joalheria (coletado pela Anastasia)
CREATE TYPE nivel_conhecimento_joias AS ENUM ('iniciante', 'intermediario', 'conhecedor');

-- Estado da conversa no funil da Anastasia
CREATE TYPE estado_conversa_agente AS ENUM (
  'TRIAGE_IN_PROGRESS',     -- triagem em andamento
  'READY_FOR_ROUTING',      -- triagem concluída, aguardando sugestão de vendedora
  'WAITING_OWNER_APPROVAL', -- sugestão submetida, aguardando aprovação das proprietárias
  'IN_HUMAN_SERVICE',       -- cliente encaminhado e em atendimento com vendedora
  'NEEDS_HUMAN'             -- automação não pode prosseguir, requer intervenção manual
);

-- Canal pelo qual o cliente chegou (rastreamento de origem de lead)
CREATE TYPE origem_contato AS ENUM ('whatsapp', 'instagram', 'site', 'indicacao', 'loja_fisica', 'outro');


-- ------------------------------------------------------------
-- Tabela: clientes
--
-- Espelho seletivo dos dados operacionais do ERP Safira.
-- Contém apenas o subconjunto de campos necessários para:
--   (a) identificar o cliente
--   (b) entrar em contato via WhatsApp
--   (c) calcular ticket médio e perfil de compra
--   (d) alimentar o agente Anastasia Volkova
--
-- Campos REMOVIDOS em relação ao ERP (data minimization, LGPD):
--   CPF, RG, data de nascimento, gênero, endereço completo
--   (logradouro, número, complemento, bairro, cidade, estado,
--   CEP), inscrição estadual, contato de cobrança.
-- Justificativa: nenhum desses campos é necessário para o
-- atendimento personalizado que é a finalidade do sistema.
-- Referência: US01-REDESIGN-ENTIDADE-CLIENTE.md
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  -- [SYS] Identificador interno desacoplado do ERP.
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [ERP] Código do cliente no ERP Safira.
  -- Nullable: clientes que chegam por WhatsApp/Instagram antes
  -- de serem cadastrados no Safira ainda não terão código.
  codigo_erp          VARCHAR(50) UNIQUE,

  -- [ERP] Razão social (PJ) ou nome completo (PF).
  -- Não é considerado dado sensível — nome comercial é público.
  nome                VARCHAR(255) NOT NULL,

  -- [ERP] Nome fantasia ou apelido do cliente.
  nome_fantasia       VARCHAR(255),

  -- [ERP] Tipo de pessoa: física ou jurídica.
  tipo_pessoa         tipo_pessoa NOT NULL DEFAULT 'fisica',

  -- [ERP] Tabela de preço negociada (varejo, atacado, etc.)
  tabela_preco        tabela_preco NOT NULL DEFAULT 'varejo',

  -- [ENCRYPTED] Telefone principal de contato.
  -- Armazenado cifrado: <iv_hex>:<authTag_hex>:<ciphertext_hex>
  -- Nunca armazene em claro — vazar telefone expõe o cliente
  -- a phishing, scam e ataques direcionados.
  telefone_1          TEXT,

  -- [HASH] HMAC-SHA256 do telefone_1 normalizado (sem espaços, sem +55).
  -- Permite buscar pelo telefone sem descriptografar.
  -- VARCHAR(64) = exatamente 64 chars hex de SHA-256.
  telefone_1_hash     VARCHAR(64) UNIQUE,

  -- [ENCRYPTED] Telefone secundário (opcional).
  telefone_2          TEXT,

  -- [ENCRYPTED] Endereço de e-mail do cliente.
  -- Tratado como sensível pela LGPD — contém hábitos e identidade.
  email               TEXT,

  -- [HASH] HMAC-SHA256 do email normalizado (lowercase, trim).
  email_hash          VARCHAR(64) UNIQUE,

  -- [ERP] Indica se o cliente está ativo no ERP Safira.
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,

  -- [ERP] Limite de crédito concedido ao cliente (em R$).
  -- Financeiro, mas não é dado sensível de pessoa — é um parâmetro
  -- comercial definido internamente.
  limite_credito      DECIMAL(15,2),

  -- [ENCRYPTED] Observações gerais sobre o cliente.
  -- Campo livre do ERP — pode conter informações sensíveis
  -- inseridas pela equipe, portanto cifrado por precaução.
  observacao_geral    TEXT,

  -- [ENCRYPTED] Observações de crédito (histórico de inadimplência,
  -- acordos comerciais, condições especiais). Campo financeiro
  -- sensível — cifrado obrigatoriamente.
  observacao_credito  TEXT,

  -- [ERP] Código da vendedora responsável pelo cliente no ERP.
  -- FK para vendedoras quando o módulo for implementado.
  vendedora_codigo_erp VARCHAR(50),

  -- [SYS] Timestamp de quando o registro foi sincronizado do ERP
  -- ou criado pelo sistema (ex: cliente captado via WhatsApp).
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- [SYS] Timestamp da última atualização do registro.
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice nos hashes — principal forma de busca por cliente
-- sem descriptografar (ex: "já temos esse WhatsApp?")
CREATE INDEX IF NOT EXISTS idx_clientes_telefone_1_hash
  ON clientes(telefone_1_hash)
  WHERE telefone_1_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_email_hash
  ON clientes(email_hash)
  WHERE email_hash IS NOT NULL;

-- Índice para sincronização incremental com o ERP Safira
CREATE INDEX IF NOT EXISTS idx_clientes_codigo_erp
  ON clientes(codigo_erp)
  WHERE codigo_erp IS NOT NULL;

-- Índice para relatórios de performance por vendedora
CREATE INDEX IF NOT EXISTS idx_clientes_vendedora
  ON clientes(vendedora_codigo_erp)
  WHERE vendedora_codigo_erp IS NOT NULL;


-- ------------------------------------------------------------
-- Tabela: clientes_perfil
--
-- Dados coletados EXCLUSIVAMENTE pelo agente Anastasia Volkova
-- durante a triagem via WhatsApp.
-- Esses dados NÃO vêm do ERP — são produzidos pelo sistema.
--
-- Separado de `clientes` por dois motivos:
--   1. LGPD direito ao esquecimento: deletar esta tabela remove
--      todos os dados de triagem sem afetar o histórico de vendas.
--   2. Clareza de responsabilidade: o módulo do agente escreve
--      aqui; o módulo ERP escreve em `clientes`.
--
-- Relação: 1 cliente → 0..1 perfil (nem todo cliente passou
-- pela triagem da Anastasia).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes_perfil (
  -- [SYS] Chave primária e FK para clientes (1-para-1).
  cliente_id              UUID PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,

  -- [ENCRYPTED] Número WhatsApp do cliente, incluindo DDI.
  -- Dado de contato direto — cifrado pelo mesmo motivo do telefone.
  -- Hash separado permite verificar duplicidade antes de criar perfil.
  whatsapp                TEXT,

  -- [HASH] HMAC-SHA256 do número WhatsApp normalizado (só dígitos).
  whatsapp_hash           VARCHAR(64) UNIQUE,

  -- Canal pelo qual o cliente chegou ao sistema pela primeira vez.
  origem_contato          origem_contato,

  -- Estado atual da conversa no funil da Anastasia.
  -- Persistido com timestamp para cálculo e auditoria de SLA.
  estado_conversa         estado_conversa_agente NOT NULL DEFAULT 'TRIAGE_IN_PROGRESS',

  -- Timestamp de cada transição de estado — essencial para
  -- cálculo de SLA da Sofia Belova (agente de monitoramento).
  estado_atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Tipo de compra declarado pelo cliente na triagem.
  tipo_compra             tipo_compra,

  -- Urgência da compra declarada pelo cliente.
  urgencia                urgencia_compra,

  -- Data pretendida para a compra (informada pelo cliente).
  -- Nullable: nem sempre o cliente sabe a data.
  data_pretendida_compra  DATE,

  -- Ticket estimado da compra atual (em R$), coletado ou
  -- inferido durante a triagem com base nas preferências.
  ticket_estimado         DECIMAL(15,2),

  -- [ENCRYPTED] Intenção de compra declarada em linguagem natural.
  -- Exemplo: "procuro um anel de noivado em ouro 18k com diamante".
  -- Cifrado porque revela preferências pessoais e poder aquisitivo.
  intencao_compra         TEXT,

  -- [ENCRYPTED] Wishlist estruturada do cliente: lista de
  -- peças, estilos ou características de interesse.
  -- Atualizada a cada nova triagem ou sinalização do cliente.
  -- Cifrado — conjunto de desejos é dado de perfil comportamental.
  wishlist                JSONB,  -- cifrado como texto JSON serializado

  -- Grau de conhecimento em joalheria, coletado pela Anastasia
  -- para calibrar a linguagem e as sugestões.
  nivel_conhecimento      nivel_conhecimento_joias,

  -- Código ERP da vendedora sugerida pela Anastasia com base
  -- no algoritmo de matching (histórico × produto × preferência).
  vendedora_sugerida_codigo VARCHAR(50),

  -- Código ERP da vendedora aprovada pelas proprietárias.
  -- Pode diferir da sugerida caso a aprovação recuse a sugestão.
  vendedora_aprovada_codigo VARCHAR(50),

  -- [ENCRYPTED] Resumo estruturado da triagem gerado pela Anastasia,
  -- incluído no handoff para a vendedora aprovada.
  -- Exemplo: "Cliente de alta frequência, presente para esposa,
  -- urgência alta, prefere peças com diamante, ticket ~R$3.000"
  resumo_triagem          TEXT,

  -- [ENCRYPTED] Notas internas adicionadas pela Anastasia ou
  -- pela equipe durante o atendimento.
  notas_internas          TEXT,

  -- [SYS] Timestamp de criação do perfil (primeira triagem).
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- [SYS] Timestamp da última atualização do perfil.
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice no hash do WhatsApp — principal lookup de entrada
-- quando chega uma mensagem nova: "esse número já é cliente?"
CREATE INDEX IF NOT EXISTS idx_perfil_whatsapp_hash
  ON clientes_perfil(whatsapp_hash)
  WHERE whatsapp_hash IS NOT NULL;

-- Índice no estado da conversa — usado pela Sofia Belova para
-- encontrar conversas em cada estado e calcular tempo de SLA.
CREATE INDEX IF NOT EXISTS idx_perfil_estado_conversa
  ON clientes_perfil(estado_conversa);

-- Índice composto para relatórios de eficácia de matching:
-- quantas sugestões foram aprovadas sem alteração?
CREATE INDEX IF NOT EXISTS idx_perfil_matching
  ON clientes_perfil(vendedora_sugerida_codigo, vendedora_aprovada_codigo)
  WHERE vendedora_sugerida_codigo IS NOT NULL;
