--- 60 — O LEAD GANHA CICLO DE VIDA PROPRIO
---
--- ==========================================================================
--- ATE AQUI O LEAD ENCAMINHADO ERA HISTORICO, E NAO FILA.
---
--- `listarPorVendedora` filtra so por `vendedora_aprovada_codigo`: sem recorte
--- de tempo e sem estado. Toda vez que a vendedora perguntasse "tenho algum
--- lead", viria tudo o que ja foi encaminhado para ela desde sempre.
---
--- O teto de 10 escondia isso por ACIDENTE — e o corte errado dando o
--- resultado certo: "os 10 mais recentes" nao e "o que eu preciso atender". Um
--- lead de tres semanas que ela nunca ligou sumia da lista sem ninguem notar,
--- porque nada o distinguia de um resolvido.
---
--- Quem viu foi o Lucas, em 22/09/2026: "pq toda vez que ela quiser saber os
--- leads dela sempre vai vir uma lista enorme, pq nunca da baixa, e isso?".
--- ==========================================================================
---
--- POR QUE NAO REUSAR `fechado_em`: ele ja esta ocupado. `encaminhar()` o
--- preenche no mesmo instante em que o lead chega a vendedora, e e ele que
--- libera o numero para abrir um proximo lead (indice parcial
--- `uq_lead_aberto_por_numero`). Dar baixa ali nao mudaria NADA para ela, e
--- de quebra travaria o numero daquela pessoa para sempre.
---
--- POR QUE NAO REUSAR `estado`: aquele e da TRIAGEM. Todo lead encaminhado
--- fica em IN_HUMAN_SERVICE para sempre. Sao duas perguntas — "onde isso esta
--- no processo da loja" e "o que EU fiz com isso" —, e uma coluna so faria a
--- triagem e a vendedora escreverem uma por cima da outra.
---
--- POR QUE QUATRO STATUS E NAO OITO: o detalhe fino de negociacao e trabalho
--- do ATENDIMENTO, que ja tem seis etapas derivadas pela
--- `vw_atendimentos_auditoria`. Repetir aquilo aqui seria manter duas verdades
--- sobre a mesma negociacao, e elas divergiriam na primeira mudanca de regra.
---
--- Aditiva e idempotente.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS status_vendedora VARCHAR(20),
  ADD COLUMN IF NOT EXISTS status_vendedora_em TIMESTAMPTZ,
  --- EM CLARO, e nao cifrada — decisao do Lucas em 22/09/2026.
  ---
  --- O `relato` do atendimento e cifrado, e esta coluna e do mesmo tipo: texto
  --- livre que a vendedora escreve sobre uma pessoa. A diferenca esta no que
  --- se ganha: em claro ela pode ser buscada e ordenada por SQL, e aparece no
  --- DBeaver na hora de depurar. Cifrada, so o ORM a enxerga.
  ---
  --- O QUE SE ACEITA AO ESCOLHER ASSIM: num vazamento de banco, ou num dump
  --- mandado para outro ambiente, estas frases vao junto e legiveis. E o tipo
  --- de texto que constrange ("nao atendeu tres vezes", "esta esperando o
  --- 13o"). Trocar depois e possivel, mas exige migrar o que ja estiver
  --- gravado.
  ADD COLUMN IF NOT EXISTS observacao_vendedora TEXT;

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS chk_lead_status_vendedora;

--- Status e carimbo andam juntos — a mesma regra do `chk_lead_vinculo` logo
--- acima. Status sem data esconde QUANDO ela mexeu, que e exatamente o que
--- permite cobrar um lead parado.
ALTER TABLE leads
  ADD CONSTRAINT chk_lead_status_vendedora CHECK (
    (status_vendedora IS NULL AND status_vendedora_em IS NULL) OR
    (status_vendedora IN ('NOVO', 'EM_CONTATO', 'VIROU_CLIENTE', 'NAO_VINGOU')
     AND status_vendedora_em IS NOT NULL)
  );

--- A FILA DELA: o que esta em aberto, do mais novo para o mais velho.
--- PARCIAL de proposito — o indice serve a pergunta "o que eu tenho para
--- fazer", e o que ela ja resolveu nao precisa pesar nele.
CREATE INDEX IF NOT EXISTS idx_leads_status_vendedora
  ON leads (vendedora_aprovada_codigo, direcionado_vendedora_em DESC)
  WHERE status_vendedora IN ('NOVO', 'EM_CONTATO');

--- ==========================================================================
--- OS LEADS QUE JA FORAM ENCAMINHADOS VIRAM `NOVO`.
---
--- Sem isto eles ficariam com status NULL e sumiriam da fila no MESMO DIA em
--- que a fila passa a existir: a vendedora abriria a lista e veria zero. Isso
--- e pior que a lista longa que estamos consertando — lista longa incomoda,
--- lista vazia faz acreditar que nao ha nada a fazer.
---
--- `direcionado_vendedora_em` como carimbo, e nao `now()`: o status nasce
--- valendo desde quando o lead chegou a ela, e nao desde a migracao. Assim
--- "ha quanto tempo esta parado" continua dizendo a verdade no dia seguinte.
--- ==========================================================================
UPDATE leads
   SET status_vendedora = 'NOVO',
       status_vendedora_em = direcionado_vendedora_em
 WHERE vendedora_aprovada_codigo IS NOT NULL
   AND direcionado_vendedora_em IS NOT NULL
   AND status_vendedora IS NULL;

COMMENT ON COLUMN leads.status_vendedora IS
  'O que a VENDEDORA fez com o lead: NOVO, EM_CONTATO, VIROU_CLIENTE, NAO_VINGOU. Diferente de `estado`, que e da triagem.';
COMMENT ON COLUMN leads.status_vendedora_em IS
  'Quando ela mexeu no status pela ultima vez. Anda junto com `status_vendedora` (ver o CHECK).';
COMMENT ON COLUMN leads.observacao_vendedora IS
  'A frase da vendedora sobre este lead. EM CLARO de proposito (decisao de 22/09/2026): buscavel por SQL, e visivel em qualquer copia do banco.';
