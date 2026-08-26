--- 39 — WHATSAPP EXTERNO DA VENDEDORA
---
--- Cada vendedora passa a ter DOIS numeros, e a diferenca entre eles nao e de
--- posse — e de INTERLOCUTOR. E dai que vem o nome das colunas:
---
---   whatsapp_interno  ->  o canal com a IA      (Elena, Anastasia)
---   whatsapp_externo  ->  o canal com o CLIENTE (o numero corporativo)
---
--- Ate aqui so existia o interno, e ele calhava de ser o celular PESSOAL dela,
--- porque nao havia outro. Agora a empresa entrega um chip corporativo, e e ele
--- que fica na frente do cliente: quem sai da equipe devolve o numero, e a
--- carteira nao vai junto no bolso de ninguem.
---
--- ==========================================================================
--- O QUE ESTA COLUNA NAO FAZ, E E IMPORTANTE QUE NAO FACA AINDA.
---
--- Ela e so o cadastro do numero. NAO liga o corporativo ao WAHA, NAO muda o
--- roteamento (`RotearMensagemInternaUseCase` continua reconhecendo a vendedora
--- unicamente pelo `whatsapp_interno_hash`) e NAO captura conversa nenhuma.
---
--- Conectar o corporativo ao WAHA e frente separada, com consequencia grande o
--- bastante para ter documento proprio — ver o planejamento de 25/08/2026 no
--- vault. Em resumo: a sessao do WAHA le a CONTA inteira, entao um corporativo
--- conectado torna visivel a conversa cliente-vendedora, que hoje o sistema
--- assume ser invisivel.
--- ==========================================================================
---
--- Mesmo tratamento do interno: [ENCRYPTED] no valor, [HASH] para busca sem
--- decifrar a base. Numero de telefone e PII, e os dois sao.

ALTER TABLE vendedoras
  -- [ENCRYPTED] Numero WhatsApp CORPORATIVO, o que a empresa entregou. E o
  -- numero que aparece para o cliente. Cifrado em AES-256-GCM, como o interno.
  ADD COLUMN IF NOT EXISTS whatsapp_externo TEXT,

  -- [HASH] HMAC-SHA256 do numero normalizado (so digitos). Permite identificar
  -- a vendedora pelo numero em webhook, sem decifrar a base inteira.
  ADD COLUMN IF NOT EXISTS whatsapp_externo_hash VARCHAR(64);

-- Um numero corporativo pertence a UMA vendedora. Chip reciclado entre pessoas
-- (a empresa reaproveita o numero de quem saiu) exige limpar o antigo antes —
-- e isso e proposital: dois cadastros vivos com o mesmo numero fariam a
-- identificacao por telefone escolher por ordem de consulta.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendedoras_whatsapp_externo_hash
  ON vendedoras(whatsapp_externo_hash)
  WHERE whatsapp_externo_hash IS NOT NULL;

-- O MESMO numero nos dois campos da MESMA vendedora nao e erro de digitacao
-- inofensivo: significaria que o pessoal dela esta exposto ao cliente, ou que o
-- corporativo virou canal da IA sem ninguem ter decidido isso.
ALTER TABLE vendedoras
  DROP CONSTRAINT IF EXISTS ck_vendedoras_whatsapps_distintos;

-- A GUARDA DO NULL NA FRENTE NAO E REDUNDANTE. `NULL IS DISTINCT FROM NULL` e
-- FALSO, entao sem ela toda vendedora sem numero nenhum violaria o CHECK — que
-- e o estado de TODAS elas hoje. O `ALTER TABLE` recusou na primeira tentativa.
ALTER TABLE vendedoras
  ADD CONSTRAINT ck_vendedoras_whatsapps_distintos
  CHECK (
    whatsapp_externo_hash IS NULL
    OR whatsapp_externo_hash IS DISTINCT FROM whatsapp_interno_hash
  );

-- ==========================================================================
-- O QUE ESTE INDICE **NAO** GARANTE
--
-- Ha um indice unico por COLUNA. Nao ha unicidade no CONJUNTO das duas: nada
-- aqui impede que o corporativo da Camila seja igual ao PESSOAL da Beatriz.
--
-- Postgres nao expressa isso com UNIQUE — precisaria de uma tabela de numeros
-- (`vendedora_whatsapps`, uma linha por numero, UNIQUE no hash), que e a
-- modelagem correta e uma remodelagem que nao se justifica hoje, com dois
-- numeros fixos por pessoa.
--
-- Ate la a trava fica na APLICACAO, no mesmo lugar onde ja mora a checagem por
-- variantes de telefone (`criar-vendedora` e `atualizar-vendedora` buscam
-- duplicata por todas as formas do numero antes de gravar). Quando o
-- roteamento passar a reconhecer os dois campos, essa checagem PRECISA olhar os
-- dois — senao a colisao entre pessoal de uma e corporativo de outra vira
-- ambiguidade de identidade no canal.
-- ==========================================================================

CREATE INDEX IF NOT EXISTS idx_vendedoras_whatsapp_externo_hash
  ON vendedoras(whatsapp_externo_hash)
  WHERE whatsapp_externo_hash IS NOT NULL;

COMMENT ON COLUMN vendedoras.whatsapp_externo IS
  '[ENCRYPTED] WhatsApp corporativo — o numero que fala com o CLIENTE. O interno fala com a IA.';
COMMENT ON COLUMN vendedoras.whatsapp_externo_hash IS
  '[HASH] HMAC-SHA256 do corporativo normalizado, para lookup sem decifrar.';
