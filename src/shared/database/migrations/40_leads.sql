--- 40 — LEADS
---
--- Quem escreve para a A.T. Jewel pela primeira vez nao existe em lugar nenhum.
--- A Anastasia conversa, entende a ocasiao, sugere a vendedora — e ao fim da
--- conversa nada disso sobreviveu: a memoria do `atwpp` e EM PROCESSO (20
--- turnos, TTL de 6h) e some no restart. Nem o nome fica.
---
--- Esta tabela e onde a triagem passa a existir.
---
--- POR QUE NAO ESCREVER EM `clientes`
---
--- O CRM CONSOME o ERP: cadastro de cliente e de vendedora nascem no Safira e
--- chegam aqui por sincronizacao. Se o lead virasse linha em `clientes`,
--- passariamos a disputar a escrita com quem e dono do cadastro — e o
--- `POST /clientes` do ERP sobre um WhatsApp que ja existe devolveria 409,
--- deixando o registro sem `codigo_erp` para sempre.
---
--- Por isso `leads` e NOSSA e independente, e `cliente_id` e NULLABLE: e uma
--- ponte, nao uma obrigacao. `clientes` continua sendo espelho do Safira.
---
---   mensagem chega -> procura em `leads` pelo hash do numero
---                  -> procura em `clientes` (ja e cliente do ERP?)
---                       achou -> preenche cliente_id
---                       nao   -> fica NULL, e nada quebra
---
--- UM LEAD POR ATENDIMENTO, NAO POR NUMERO
---
--- A pessoa que procurou alianca em novembro pode voltar em dezembro querendo
--- presente de Natal. Sao DOIS atendimentos, cada um com o seu comeco — e o
--- comeco importa, porque tres dos doze campos que a reuniao pediu sao marcos
--- de tempo:
---
---   criado_em                 a Anastasia atendeu, o lead existe
---   direcionado_gestao_em     triagem pronta, subiu para o admin
---   direcionado_vendedora_em  o admin encaminhou            (fase 2)
---
--- Com um lead por NUMERO, o retorno de dezembro sobrescreveria novembro e o
--- `criado_em` passaria a responder "quando ela apareceu a primeira vez" — a
--- regua de SLA quebraria justamente no caso interessante.
---
--- Mas tambem nao pode virar lead novo a cada mensagem: quem escreve hoje e
--- continua amanha esta na MESMA conversa. A regra e a mesma que
--- `atendimentos` ja usa desde a migracao 35 — um ABERTO por vez, quantos
--- fechados quiser:
---
---   uq_atendimento_aberto_por_cliente ON atendimentos (cliente_id)
---     WHERE fechado_em IS NULL
---
--- O RECONHECIMENTO, QUE E O MOTIVO DO HASH
---
--- Numero que ja passou por aqui nao deve ser perguntado de novo. Achando o
--- lead anterior, a Anastasia reaproveita nome e apelido e abre com "Ola,
--- Carla, tudo bem?" — indo direto ao que ela veio buscar DESTA vez.
---
--- Por isso as duas colunas de contato, como em `clientes_perfil`:
---
---   whatsapp       [ENCRYPTED]  reversivel — e o numero que a vendedora liga
---   whatsapp_hash  [HASH]       irreversivel — so para ACHAR o registro
---
--- O hash existe para comparar sem decifrar a base inteira e sem o numero
--- aparecer em indice. Quem precisa do numero le a coluna cifrada, que o
--- `encryptedTransformer` decifra sozinho.
---
--- O NOME VAI EM TEXTO, e nao cifrado, por consistencia: `clientes.nome` e
--- `varchar` comum. O que o projeto cifra e contato e relato.
---
--- O QUE ESTA MIGRACAO NAO FAZ
---
--- Nao cria coluna de encaminhamento (`vendedora_aprovada_codigo`,
--- `direcionado_vendedora_em`) nem de agendamento: coluna que ninguem escreve
--- e divida. Elas entram nas fases 2 e 3, junto do codigo que as preenche.
---
--- E nao toca em `atendimentos`. Encaminhar um lead para a vendedora esbarra
--- em `atendimentos.cliente_id NOT NULL REFERENCES clientes(id)` — decisao
--- que continua aberta e que so a fase 2 precisa resolver.
---
--- NENHUM TIPO NOVO. Reaproveita `origem_contato`, `ocasiao_atendimento` e
--- `estado_conversa_agente`, todos ja no banco.

CREATE TABLE IF NOT EXISTS leads (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidade. Tudo nullable menos o contato: a triagem comeca sabendo apenas
  -- o numero de quem escreveu, e o resto e descoberto ao longo da conversa.
  nome                      VARCHAR(255),
  apelido                   VARCHAR(255),
  whatsapp                  TEXT        NOT NULL,
  whatsapp_hash             VARCHAR(64) NOT NULL,

  -- Triagem.
  origem_contato            origem_contato,
  ocasiao                   ocasiao_atendimento,
  produtos_desejados        TEXT,
  resumo_triagem            TEXT,
  vendedora_sugerida_codigo VARCHAR(50),

  -- Estado da conversa. Mesmo enum de `clientes_perfil.estado_conversa`:
  -- TRIAGE_IN_PROGRESS -> READY_FOR_ROUTING -> WAITING_OWNER_APPROVAL ->
  -- IN_HUMAN_SERVICE, mais NEEDS_HUMAN.
  estado                    estado_conversa_agente NOT NULL DEFAULT 'TRIAGE_IN_PROGRESS',
  estado_atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A ponte com o ERP. Preenchido quando o numero e reconhecido em `clientes`,
  -- seja na chegada da mensagem, seja quando o ERP sincronizar depois.
  cliente_id                UUID REFERENCES clientes(id) ON DELETE SET NULL,
  vinculado_em              TIMESTAMPTZ,

  -- Marcos de tempo (campos 10 e 11 da reuniao; o 12 entra na fase 2).
  direcionado_gestao_em     TIMESTAMPTZ,

  -- Fecha quando o lead e encaminhado ou expira. E o que libera o numero para
  -- um proximo atendimento — ver o indice parcial abaixo.
  fechado_em                TIMESTAMPTZ,

  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Vinculo e carimbo andam juntos: `cliente_id` sem `vinculado_em` esconde
  -- QUANDO o casamento aconteceu, que e o que permite auditar a ligacao.
  CONSTRAINT chk_lead_vinculo CHECK (
    (cliente_id IS NULL     AND vinculado_em IS NULL) OR
    (cliente_id IS NOT NULL AND vinculado_em IS NOT NULL)
  )
);

-- UM ABERTO POR NUMERO. Parcial de proposito: so restringe quem ainda esta em
-- andamento. Historico nao colide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_aberto_por_numero
  ON leads (whatsapp_hash) WHERE fechado_em IS NULL;

-- O reconhecimento: "esse numero ja passou por aqui?", pegando o mais recente.
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_hash
  ON leads (whatsapp_hash, criado_em DESC);

-- A fila do admin: o que esta pronto para encaminhar, mais antigo primeiro.
CREATE INDEX IF NOT EXISTS idx_leads_estado
  ON leads (estado, criado_em) WHERE fechado_em IS NULL;

-- Para o casamento no sentido inverso, quando o ERP sincroniza um cliente novo
-- e queremos saber se ele ja tinha passado pela triagem.
CREATE INDEX IF NOT EXISTS idx_leads_cliente
  ON leads (cliente_id) WHERE cliente_id IS NOT NULL;

COMMENT ON TABLE leads IS
  'Triagem da Anastasia antes de existir cadastro. Um lead por atendimento; cliente_id e ponte opcional com o ERP.';
COMMENT ON COLUMN leads.whatsapp IS
  '[ENCRYPTED] O numero que a vendedora usa para entrar em contato.';
COMMENT ON COLUMN leads.whatsapp_hash IS
  '[HASH] HMAC-SHA256 do numero normalizado, para reconhecer sem decifrar.';
COMMENT ON COLUMN leads.cliente_id IS
  'NULLABLE de proposito: o CRM nunca escreve em `clientes`, que e espelho do ERP.';
COMMENT ON COLUMN leads.fechado_em IS
  'Encaminhado ou expirado. Enquanto NULL, o numero nao pode abrir outro lead.';
