-- ============================================================
-- A.T. JEWEL — Migracao 49: a observacao POR arquivo de referencia
--
-- Ate aqui a observacao era uma referencia SOLTA, do tipo
-- OBSERVACAO: uma linha valendo para o catalogo inteiro. Dava para
-- escrever "fundo branco", mas nao para dizer de QUAL imagem se
-- estava falando.
--
-- A coluna guarda o pedido daquele arquivo especifico. Fica na
-- propria linha da referencia — e nao numa tabela de ligacao entre
-- duas referencias — porque a relacao e um-para-um e nao tem
-- historico: e a nota daquela imagem, e so.
--
-- PARA QUEM ELA SERVE, sem ilusao: para GENTE. Referencia visual
-- nao chega a IA — decisao de 28/08/2026, escrita no
-- `tratar-foto.use-case.ts`, porque mandar as imagens de
-- referencia fez o modelo devolver uma joia recortada de dentro de
-- uma delas. Entao a observacao acompanha o arquivo na EXPORTACAO,
-- que e onde quem monta o catalogo vai le-la.
--
-- Vale para qualquer referencia com arquivo, imagem ou PDF. Na
-- referencia de texto ela nao faz sentido — o texto ja e a
-- observacao —, e por isso nao ha NOT NULL nem default.
--
-- Origem: [SYS] — dado operacional. Sem PII.
-- ============================================================

ALTER TABLE catalogo_referencias
  ADD COLUMN IF NOT EXISTS observacao TEXT;

COMMENT ON COLUMN catalogo_referencias.observacao IS
  '[SYS] O que foi pedido DESTE arquivo. Acompanha a imagem na exportacao; nao vai para a IA.';
