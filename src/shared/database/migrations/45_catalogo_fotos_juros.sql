-- ============================================================
-- A.T. JEWEL — Migracao 45: o juro do parcelamento, por peca
--
-- Ate aqui a foto guardava so `parcelas` (10, 6), e o valor da
-- parcela saia de uma tabela CHUMBADA NO CODIGO: dividir o a vista
-- por 0,80 em 10X e por 0,90 em 6X. Levantada em 25 de 25 pecas em
-- 20/08/2026, e valida — mas fixa.
--
-- O QUE MUDA: a legenda passa a poder dizer o juro.
--
--   "0001 BR26252 12x 15%"    -> juros_percentual = 15.00
--   "0001 BR26252 10x sem juros" -> juros_percentual = 0.00
--   "0001 BR26252 10x"        -> juros_percentual = NULL
--
-- E O NULL E SIGNIFICATIVO, nao e ausencia de dado: ele quer dizer
-- "ninguem informou, use a regra da casa". Sem ele nao daria para
-- distinguir uma peca em que a pessoa digitou 25% de uma em que ela
-- nao digitou nada — e as duas dao o mesmo numero hoje, mas passam a
-- divergir no dia em que a regra padrao mudar.
--
-- A CONTA, decidida com o Lucas em 01/09/2026:
--
--   total parcelado = a_vista * (1 + juros/100)
--   parcela         = total / parcelas
--
-- Repare que ela NAO e a mesma da regra antiga. Dividir por 0,80
-- equivale a um juro de 25%, e nao de 20% — 44.900 / 0,80 e o mesmo
-- que 44.900 * 1,25. Por isso a regra antiga continua sendo aplicada
-- quando a coluna e NULL, em vez de traduzida para um percentual:
-- traduzir mudaria o preco impresso das pecas ja cadastradas.
--
-- Origem: [SYS] — dado operacional. Sem PII.
-- ============================================================

ALTER TABLE catalogo_fotos
  ADD COLUMN IF NOT EXISTS juros_percentual NUMERIC(5,2)
    CHECK (juros_percentual IS NULL OR juros_percentual >= 0);

COMMENT ON COLUMN catalogo_fotos.juros_percentual IS
  '[SYS] Juro do parcelamento em %, sobre o a vista. 0 = sem juros. NULL = nao informado, usa a regra da casa (0,80 em 10X, 0,90 em 6X).';
