-- ============================================================
-- A.T. JEWEL — Migracao 52: a ocorrencia ganha CLIENTE e FOTO
--
-- MEL-20 do Documento de Melhorias. O modulo existe desde a
-- migracao 15 e ja exige produto, tipo, descricao e data. Faltavam
-- duas coisas que o documento pede e uma peca de joalheria torna
-- obvias:
--
--   DE QUEM foi a peca que voltou
--   COMO ela voltou
--
-- ------------------------------------------------------------
-- O CLIENTE E OPCIONAL, e a escolha nao e preguica.
--
-- Ocorrencia nem sempre tem cliente: peca que chega com defeito do
-- fornecedor, quebra na vitrine ou some no estoque nao passou por
-- ninguem. Exigir cliente obrigaria a inventar um, e cliente
-- inventado suja o historico de todo mundo.
--
-- `ON DELETE SET NULL` porque a ocorrencia sobrevive ao cadastro:
-- apagar o cliente nao pode apagar o registro de que a peca voltou.
-- ------------------------------------------------------------
--
-- ------------------------------------------------------------
-- AS FOTOS SAO TABELA A PARTE, e nao uma coluna.
--
-- Uma peca com defeito quase nunca se explica numa foto: o arranhao
-- de um angulo, a solda de outro, a nota fiscal de um terceiro.
-- Coluna unica obrigaria a escolher, e quem registra escolheria
-- errado.
--
-- Guarda a CHAVE do armazenamento, nunca a URL — a mesma regra do
-- catalogo. `ON DELETE CASCADE`: foto de ocorrencia apagada nao
-- serve para nada.
-- ------------------------------------------------------------
--
-- Origem: [SYS] — dado operacional. O cliente e referencia por id;
-- nenhuma PII e copiada para ca.
-- ============================================================

ALTER TABLE defeitos_devolucoes
  ADD COLUMN IF NOT EXISTS cliente_id UUID
    REFERENCES clientes(id) ON DELETE SET NULL;

COMMENT ON COLUMN defeitos_devolucoes.cliente_id IS
  '[SYS] De quem era a peca. NULL = nao passou por cliente (defeito de fornecedor, quebra em loja).';

-- Filtrar "as ocorrencias deste cliente" e a consulta que o
-- historico pede, e sem indice ela varre a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_ocorrencias_cliente
  ON defeitos_devolucoes(cliente_id)
  WHERE cliente_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS ocorrencia_fotos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  ocorrencia_id UUID        NOT NULL
                            REFERENCES defeitos_devolucoes(id) ON DELETE CASCADE,

  -- [SYS] Chave no armazenamento (ex.: ocorrencias/<id>/uuid.jpg).
  arquivo_id    TEXT        NOT NULL,
  mime          TEXT        NOT NULL,

  -- Nome como veio do computador de quem enviou. So para exibir.
  nome_arquivo  TEXT,

  ordem         INTEGER     NOT NULL DEFAULT 0,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocorrencia_fotos_ocorrencia
  ON ocorrencia_fotos(ocorrencia_id, ordem);
