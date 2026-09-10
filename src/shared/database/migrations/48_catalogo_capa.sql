-- ============================================================
-- A.T. JEWEL — Migracao 48: a capa escolhida do catalogo
--
-- Ate aqui a capa era "a primeira referencia de imagem que
-- aparecesse", por ordem de envio. Isso tem dois problemas: a
-- pessoa nao escolhe, e a capa MUDA sozinha quando ela apaga ou
-- reordena as referencias.
--
-- A coluna guarda a referencia ESCOLHIDA. Nao e um arquivo novo:
-- a capa e sempre uma das referencias que ja foram anexadas.
--
-- POR QUE `ON DELETE SET NULL`, e nao CASCADE nem RESTRICT:
--
--   CASCADE apagaria o CATALOGO ao apagar uma referencia. Absurdo.
--   RESTRICT impediria apagar a referencia que virou capa, e a
--   pessoa teria que descobrir sozinha por que aquela imagem se
--   recusa a sair.
--   SET NULL faz o catalogo VOLTAR ao comportamento de hoje —
--   primeira imagem — sem erro e sem linha apontando para arquivo
--   que nao existe mais.
--
-- A REFERENCIA CIRCULAR e proposital e o Postgres a aceita:
-- catalogos aponta para catalogo_referencias, que aponta de volta
-- para catalogos. Apagar um catalogo funciona — o CASCADE das
-- referencias dispara o SET NULL numa linha que esta sendo
-- removida na mesma transacao.
--
-- NULL NAO E AUSENCIA DE CAPA, e sim "escolha automatica". Sem
-- referencia de imagem nenhuma, a tela desenha o esboco, como ja
-- fazia.
--
-- Origem: [SYS] — dado operacional. Sem PII.
-- ============================================================

ALTER TABLE catalogos
  ADD COLUMN IF NOT EXISTS capa_referencia_id UUID
    REFERENCES catalogo_referencias(id) ON DELETE SET NULL;

COMMENT ON COLUMN catalogos.capa_referencia_id IS
  '[SYS] Referencia de imagem escolhida como capa. NULL = automatica (a primeira imagem).';
