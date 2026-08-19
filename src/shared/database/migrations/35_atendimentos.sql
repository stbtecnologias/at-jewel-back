-- ============================================================
-- A.T. JEWEL — Migracao 35: `atendimentos` e `atendimento_interacoes`
--
-- POR QUE: ate aqui o acompanhamento de um cliente vivia em
-- `clientes_perfil.estado_conversa` — UMA linha por cliente, para sempre.
-- Quando o cliente volta meses depois, aquele campo e sobrescrito e o episodio
-- anterior desaparece: nao ha como perguntar "o que aconteceu da ultima vez".
--
-- A ata de 17/08/2026 pede explicitamente o oposto:
--
--   "Cada interacao gera um evento. Se a vendedora informa que o cliente pediu
--    contato as 08h do dia seguinte, o sistema cria automaticamente a tarefa
--    para aquele horario, organizando a agenda diaria e semanal de cada
--    vendedora."
--
-- Dois niveis, entao:
--
--   atendimentos            o EPISODIO — abre no encaminhamento, fecha no
--                           desfecho. O mesmo cliente daqui a seis meses abre
--                           outro, e o anterior continua inteiro.
--   atendimento_interacoes  a LINHA DO TEMPO dentro do episodio: o aviso, a
--                           cobranca agendada, o relato da vendedora, o
--                           reagendamento. Remarcar NAO abre episodio novo —
--                           vira mais uma linha, e a data nova gera a proxima
--                           cobranca.
--
-- UM ATENDIMENTO = UMA OCASIAO (decisao do Lucas, 19/08/2026). Noivado com
-- anel e colar e UM atendimento; noivado hoje e aniversario em fevereiro sao
-- DOIS. Do ponto de vista da cliente e uma conversa so por ocasiao, e e assim
-- que a analise fica util: "quantos atendimentos de noivado viraram venda".
--
-- `ocasiao` NAO se confunde com `clientes_perfil.motivacao_compra`:
--   motivacao_compra  POR QUE compra   uso_proprio | presente | status | investimento
--   ocasiao           PARA QUAL evento casamento | aniversario | ...
-- A motivacao e traco do cliente e fica no perfil; a ocasiao e do momento e
-- fica aqui, para que duas visitas com ocasioes diferentes coexistam.
--
-- Aditiva: cria tabelas e enums novos, nao altera nada existente.
-- ============================================================

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE ocasiao_atendimento AS ENUM (
    'CASAMENTO', 'NOIVADO', 'ANIVERSARIO', 'FORMATURA',
    'DATA_COMEMORATIVA', 'AUTOPRESENTE', 'OUTRO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Como o episodio termina. NULL enquanto aberto.
  --   VENDA      fechou negocio
  --   SEM_VENDA  cliente decidiu nao comprar, e disse isso
  --   INATIVIDADE fechado pelo sistema por falta de interacao (ver nota abaixo)
  CREATE TYPE desfecho_atendimento AS ENUM ('VENDA', 'SEM_VENDA', 'INATIVIDADE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_interacao AS ENUM (
    'ENCAMINHADO',    -- a Anastasia avisou a vendedora
    'LEMBRETE',       -- aviso antes do horario combinado
    'COBRANCA',       -- "como foi com o cliente?"
    'RELATO',         -- o que a vendedora respondeu
    'REAGENDAMENTO',  -- o cliente pediu outro horario
    'NOTA'            -- anotacao avulsa, sem agendamento
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Estado de uma interacao AGENDADA. Interacao que ja aconteceu (RELATO,
  -- NOTA) nasce CONCLUIDA.
  CREATE TYPE estado_interacao AS ENUM (
    'PENDENTE',            -- agendada, ainda nao disparada
    'ENVIADA',             -- mensagem entregue ao WhatsApp
    'AGUARDANDO_RESPOSTA', -- enviada e esperando o relato
    'CONCLUIDA',           -- respondida, ou nao precisava de resposta
    'EXPIRADA'             -- venceu sem resposta
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- atendimentos — o episodio
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atendimentos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id   UUID NOT NULL REFERENCES clientes(id),
  -- A vendedora sai da carteira (`clientes.vendedora_codigo_erp`) no momento
  -- da abertura e fica CONGELADA aqui: se a carteira for remanejada depois —
  -- a regra dos 6 meses da ata —, o historico continua dizendo quem atendeu.
  vendedora_id UUID NOT NULL REFERENCES vendedoras(id),

  ocasiao      ocasiao_atendimento,
  aberto_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  fechado_em   TIMESTAMPTZ,
  desfecho     desfecho_atendimento,

  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Fechado exige desfecho, e desfecho exige fechado. Sem isto aparece
  -- "fechado sem motivo" e "com desfecho mas ainda aberto", e nenhum relatorio
  -- de conversao fecha a conta.
  CONSTRAINT chk_atendimento_fechamento CHECK (
    (fechado_em IS NULL AND desfecho IS NULL) OR
    (fechado_em IS NOT NULL AND desfecho IS NOT NULL)
  )
);

-- UM ABERTO POR CLIENTE. Indice parcial: so as linhas com `fechado_em` nulo
-- entram, entao o mesmo cliente pode ter N atendimentos fechados e no maximo
-- um em curso. E o que impede a mesma conversa de virar duas linhas do tempo,
-- nenhuma delas contando a historia inteira.
CREATE UNIQUE INDEX IF NOT EXISTS uq_atendimento_aberto_por_cliente
  ON atendimentos (cliente_id) WHERE fechado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_atendimentos_vendedora
  ON atendimentos (vendedora_id, aberto_em DESC);
CREATE INDEX IF NOT EXISTS idx_atendimentos_cliente
  ON atendimentos (cliente_id, aberto_em DESC);

COMMENT ON TABLE atendimentos IS
  'Episodio de atendimento de um cliente por uma vendedora, delimitado por UMA ocasiao. O mesmo cliente volta meses depois e abre outro; o anterior fica inteiro.';
COMMENT ON COLUMN atendimentos.ocasiao IS
  'Para qual acontecimento. NAO confundir com clientes_perfil.motivacao_compra, que diz por que compra.';
COMMENT ON COLUMN atendimentos.vendedora_id IS
  'Congelada na abertura: remanejar a carteira depois nao reescreve quem atendeu.';

-- ------------------------------------------------------------
-- atendimento_interacoes — a linha do tempo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atendimento_interacoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
  tipo           tipo_interacao NOT NULL,

  -- Quando a interacao DEVE acontecer (LEMBRETE, COBRANCA). NULL no que ja
  -- aconteceu. E por esta coluna que o agendador varre o que venceu, e e ela
  -- que monta a agenda diaria da vendedora.
  agendado_para  TIMESTAMPTZ,
  -- Quando aconteceu de fato.
  ocorrido_em    TIMESTAMPTZ,

  estado         estado_interacao NOT NULL DEFAULT 'PENDENTE',

  -- O que a vendedora contou, nas palavras dela. CIFRADO (AES-256-GCM, mesmo
  -- transformer de telefone e e-mail): texto livre nao tem como ser previsto,
  -- e o que chega aqui e a vida da cliente dita em voz alta — "esta se
  -- separando", "o marido nao pode saber do valor", "pediu para parcelar".
  -- A parte ANALITICA (a ocasiao) mora estruturada em atendimentos.ocasiao,
  -- em claro, para poder ser filtrada e cruzada.
  relato         TEXT,

  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Interacao agendada precisa de horario; sem horario nao ha o que agendar.
  CONSTRAINT chk_interacao_agendada CHECK (
    (tipo IN ('LEMBRETE', 'COBRANCA') AND agendado_para IS NOT NULL) OR
    (tipo NOT IN ('LEMBRETE', 'COBRANCA'))
  )
);

-- A varredura do agendador: "o que venceu e ainda nao foi disparado".
-- Parcial, porque o volume interessante e sempre uma fracao minima da tabela.
CREATE INDEX IF NOT EXISTS idx_interacoes_pendentes
  ON atendimento_interacoes (agendado_para)
  WHERE estado = 'PENDENTE' AND agendado_para IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interacoes_atendimento
  ON atendimento_interacoes (atendimento_id, criado_em);

COMMENT ON TABLE atendimento_interacoes IS
  'Linha do tempo de um atendimento. Reagendar NAO abre atendimento novo: vira mais uma linha, e a data nova gera a proxima cobranca.';
COMMENT ON COLUMN atendimento_interacoes.relato IS
  'Texto livre da vendedora, cifrado. A ocasiao, que e o dado analitico, fica em atendimentos.ocasiao, em claro.';
