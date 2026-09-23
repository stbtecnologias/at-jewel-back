-- ============================================================
-- A.T. JEWEL — Migracao 59: a aprovacao do catalogo
--
-- Ate aqui o catalogo nao tinha fim: montava-se, ajustava-se e
-- nada dizia "e este". O status PUBLICADO existia desde a 42, mas
-- nenhum caminho levava ate ele.
--
-- Pedido do Lucas em 17/09/2026: um botao "Aprovar catalogo". A
-- aprovacao vale para a VERSAO ATUAL (a mais recente de
-- catalogo_finais), leva o catalogo a PUBLICADO e TRAVA montar,
-- ajustar e enviar ate alguem desfazer.
--
-- E A CAPA DA VERSAO APROVADA PASSA A SER A CAPA DO CATALOGO — a
-- do cabecalho e a do card da lista:
--
--   versao montada com tema  -> a arte da capa do PDF, sem o
--                               titulo (a `.capa.jpg` do plano)
--   sem arte (sem tema, ou
--   PDF do marketing)        -> a foto da primeira peca aprovada
--
-- POR QUE GUARDAR A CHAVE DA IMAGEM, e nao deduzi-la a cada
-- leitura: deduzir exigiria abrir o `.plano.json` no bucket para
-- cada card da listagem. A chave e resolvida uma vez, na
-- aprovacao.
--
-- POR QUE `ON DELETE SET NULL` no final aprovado: as versoes nao
-- se apagam pela tela, mas se uma sumir por fora, o catalogo nao
-- pode sumir junto (CASCADE) nem travar a limpeza (RESTRICT).
--
-- `aprovado_por` e TEXTO, como `catalogo_finais.enviado_por`:
-- rotulo de historico, e nao chave — o usuario pode ser removido
-- e o registro de quem aprovou continua valendo.
--
-- Desfazer a aprovacao limpa as quatro colunas e volta o status a
-- COLETANDO. A capa volta a ser a referencia escolhida.
--
-- Origem: [SYS] — dado operacional. Sem PII de cliente.
-- ============================================================

ALTER TABLE catalogos
  ADD COLUMN IF NOT EXISTS aprovado_final_id UUID
    REFERENCES catalogo_finais(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovado_capa_arquivo_id TEXT,
  ADD COLUMN IF NOT EXISTS aprovado_por TEXT,
  ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMPTZ;

COMMENT ON COLUMN catalogos.aprovado_final_id IS
  '[SYS] Versao de catalogo_finais aprovada. NULL = catalogo nao aprovado.';
COMMENT ON COLUMN catalogos.aprovado_capa_arquivo_id IS
  '[SYS] Chave da imagem que vira capa com a aprovacao: a arte da capa do PDF ou a foto da primeira peca.';
COMMENT ON COLUMN catalogos.aprovado_por IS
  '[SYS] Nome (ou e-mail) de quem aprovou. Rotulo de historico, nao FK.';
COMMENT ON COLUMN catalogos.aprovado_em IS
  '[SYS] Quando o catalogo foi aprovado.';
