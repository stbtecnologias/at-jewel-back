-- ============================================================
-- A.T. JEWEL — Migracao 43: o contador de geracoes comeca em zero
--
-- `catalogo_fotos.versoes` conta GERACOES DA IA sobre aquela foto.
-- Nasceu com DEFAULT 1, e o valor estava errado por um: uma foto
-- recem-chegada nao teve geracao nenhuma.
--
-- O erro custou duas coisas em producao, medidas em 31/08/2026 na
-- peca BR26252:
--
--   1. a tela exibia "2 geracoes" depois de UMA unica geracao;
--   2. o teto de tres tentativas do TratarFotoUseCase (`versoes >=
--      3`) era atingido na SEGUNDA — entregando duas das tres.
--
-- O codigo passou a gravar 0 explicitamente ao criar a foto, entao o
-- DEFAULT so alcancaria linha inserida por fora (carga, script,
-- DBeaver). Mesmo assim ele muda: default que mente e armadilha para
-- quem vier depois e confiar nele.
--
-- As linhas JA GRAVADAS ficam como estao, de proposito. Corrigi-las
-- exigiria adivinhar quantas geracoes cada uma teve, e sao tres fotos
-- de teste — reescrever historico para acertar um contador de ensaio
-- e mais risco do que o dado vale.
--
-- Origem: [SYS] — dado operacional do sistema novo.
-- ============================================================

ALTER TABLE catalogo_fotos
  ALTER COLUMN versoes SET DEFAULT 0;

COMMENT ON COLUMN catalogo_fotos.versoes IS
  '[SYS] Quantas geracoes da IA esta foto teve. 0 = nunca tratada; 1 = acertou de primeira. Teto em MAX_GERACOES.';
