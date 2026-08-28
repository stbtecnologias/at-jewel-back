--- 41 — ENCAMINHAMENTO DO LEAD
---
--- A migracao 40 parou onde a triagem para: o lead existe, tem nome, ocasiao e
--- o que a pessoa procura. Faltava o outro lado — o admin decidir de quem e
--- aquele cliente, e a vendedora ficar sabendo.
---
--- Sao os campos 8 e 12 da lista da reuniao, e eles fecham a regua de tempo
--- que a 40 comecou:
---
---   criado_em                 a Anastasia atendeu, o lead existe      (10)
---   direcionado_gestao_em     triagem pronta, subiu para o admin      (11)
---   direcionado_vendedora_em  o admin encaminhou                      (12)
---
--- Com os tres, da para responder quanto tempo o cliente esperou em cada
--- etapa — que e a pergunta que a reuniao estava fazendo ao pedir os marcos.
---
--- POR QUE AQUI, E NAO EM `atendimentos`
---
--- Encaminhar NAO e atender. O `atendimento` nasce quando ha horario combinado
--- e o fluxo de agendamento comeca — e ai o cliente ja existe no ERP, entao
--- `atendimentos.cliente_id NOT NULL` continua valendo sem uma linha de
--- mudanca. Os 17 arquivos que dependem dele — agenda, lembrete, cobranca,
--- relato, auditoria, SLA — nao precisam aprender o que e um lead.
---
--- O ENCAMINHAMENTO FECHA O LEAD
---
--- `fechado_em` preenchido libera o numero para um proximo atendimento (o
--- indice parcial da 40). E o que faz a mesma pessoa poder voltar em dezembro
--- com outra ocasiao sem colidir com o atendimento de novembro.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS vendedora_aprovada_codigo VARCHAR(50),
  ADD COLUMN IF NOT EXISTS direcionado_vendedora_em  TIMESTAMPTZ;

-- Codigo e carimbo andam juntos, nos dois sentidos: um sem o outro esconde
-- QUEM recebeu ou QUANDO recebeu, e a regua de tempo depende dos dois.
-- (Guarda de NULL na frente porque `NULL IS DISTINCT FROM NULL` e FALSO — sem
-- ela, todo lead ainda nao encaminhado violaria a constraint.)
ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS chk_lead_encaminhamento;

ALTER TABLE leads
  ADD CONSTRAINT chk_lead_encaminhamento CHECK (
    (vendedora_aprovada_codigo IS NULL     AND direcionado_vendedora_em IS NULL) OR
    (vendedora_aprovada_codigo IS NOT NULL AND direcionado_vendedora_em IS NOT NULL)
  );

-- A carteira da vendedora, do lado dos leads: o que foi encaminhado para ela.
CREATE INDEX IF NOT EXISTS idx_leads_vendedora_aprovada
  ON leads (vendedora_aprovada_codigo, direcionado_vendedora_em DESC)
  WHERE vendedora_aprovada_codigo IS NOT NULL;

COMMENT ON COLUMN leads.vendedora_aprovada_codigo IS
  'Codigo ERP da vendedora que o ADM escolheu. Sugestao e outra coluna — o admin pode discordar dela.';
COMMENT ON COLUMN leads.direcionado_vendedora_em IS
  'Quando o ADM encaminhou. Com criado_em e direcionado_gestao_em, fecha a regua de SLA do lead.';
