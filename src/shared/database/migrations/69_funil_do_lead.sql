--- 69 — O FUNIL DO LEAD: ANA-03
---
--- ==========================================================================
--- OS ESTADOS DE HOJE DESCREVEM UMA TRIAGEM QUE NAO EXISTE MAIS.
---
--- `estado_conversa_agente` nasceu para a triagem automatica, e seus valores
--- falam de ROTEAMENTO, nao de venda:
---
---   TRIAGE_IN_PROGRESS      a triagem esta perguntando
---   READY_FOR_ROUTING       ja da para escolher a vendedora
---   WAITING_OWNER_APPROVAL  a gestao precisa aprovar
---   IN_HUMAN_SERVICE        passou para gente
---   NEEDS_HUMAN             a triagem desistiu
---
--- A triagem foi desligada em 24/09/2026. Desde entao o lead nasce do LEITOR
--- DE CONVERSAS (MEL-15), que le o numero da vendedora — e cai em
--- `TRIAGE_IN_PROGRESS`, um estado que nao quer dizer nada.
---
--- Conferido em 29/09/2026: o primeiro lead nascido do caminho novo entrou
--- exatamente assim.
--- ==========================================================================
---
--- POR QUE UM ENUM NOVO, E NAO ACRESCENTAR VALORES AO QUE EXISTE.
---
--- `estado_conversa_agente` e usado por DUAS colunas:
---
---   leads.estado                   -> o funil (esta migracao)
---   clientes_perfil.estado_conversa -> a conversa do cliente (nao muda)
---
--- Elas passaram a significar coisas diferentes. Somar `GANHO` e `PERDIDO` ao
--- enum compartilhado ofereceria ao `clientes_perfil` valores que nao fazem
--- sentido la, e o banco nao teria como recusar. Separar e o que permite que
--- cada coluna so aceite o que lhe cabe.
---
--- ==========================================================================
--- O DESENHO, APROVADO PELO LUCAS EM 29/09/2026.
---
---   NOVO            nasceu da primeira mensagem, ninguem respondeu ainda
---   EM_ATENDIMENTO  a vendedora respondeu
---   GANHO           o leitor viu VENDA
---   PERDIDO         o leitor viu SEM_VENDA
---   PARADO          7 dias sem mensagem, sem desfecho
---
--- NOVO -> EM_ATENDIMENTO E O QUE DA O TEMPO DE PRIMEIRA RESPOSTA (ANA-09) DE
--- GRACA. E a metrica que a gestao mais pediu, e ela nasce da transicao, nao
--- de uma coluna nova: `estado_atualizado_em` ja existe e ja e mantido.
---
--- PARADO alimenta o alerta do ANA-19. Sete dias e decisao do Lucas.
--- ==========================================================================

CREATE TYPE estado_lead AS ENUM (
  'NOVO',
  'EM_ATENDIMENTO',
  'GANHO',
  'PERDIDO',
  'PARADO'
);

--- A TRADUCAO DOS ESTADOS ANTIGOS.
---
--- Em 29/09/2026 havia DOIS leads na base de producao, e o Lucas disse que
--- pode apagar o antigo para comecar do zero. A traducao existe mesmo assim:
--- uma migracao que so funciona com a tabela vazia e uma armadilha para quem
--- rodar depois, em outro ambiente, com dado que ninguem conferiu.
---
--- Todos os estados da triagem viram NOVO, menos `IN_HUMAN_SERVICE`: os
--- quatro primeiros descrevem a MAQUINA trabalhando, e em nenhum deles uma
--- vendedora respondeu ao cliente. Chamar isso de EM_ATENDIMENTO inflaria o
--- tempo de primeira resposta com atendimento que nunca houve.
ALTER TABLE leads
  ALTER COLUMN estado DROP DEFAULT,
  ALTER COLUMN estado TYPE estado_lead
    USING (
      CASE estado::text
        WHEN 'IN_HUMAN_SERVICE' THEN 'EM_ATENDIMENTO'
        ELSE 'NOVO'
      END
    )::estado_lead,
  ALTER COLUMN estado SET DEFAULT 'NOVO'::estado_lead;

--- O indice do alerta de PARADO: a varredura pergunta "quem esta em NOVO ou
--- EM_ATENDIMENTO ha mais de 7 dias", e sem isto varre a tabela inteira a
--- cada rodada. Parcial porque GANHO e PERDIDO nunca entram na conta.
CREATE INDEX IF NOT EXISTS idx_leads_em_aberto
  ON leads (estado_atualizado_em)
  WHERE estado IN ('NOVO', 'EM_ATENDIMENTO');

COMMENT ON TYPE estado_lead IS
  'O funil do lead (ANA-03). Nao confundir com `estado_conversa_agente`, que descreve a conversa do cliente em `clientes_perfil`.';
COMMENT ON COLUMN leads.estado IS
  'NOVO ate a vendedora responder; GANHO/PERDIDO saem do leitor de conversas; PARADO sai da varredura de 7 dias.';
