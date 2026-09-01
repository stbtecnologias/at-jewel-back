-- ============================================================
-- A.T. JEWEL — Migracao 44: as versoes da peca final
--
-- A migracao 42 previu UMA peca final por catalogo, em quatro
-- colunas de `catalogos` (final_origem, final_arquivo_id,
-- final_nome_arquivo, final_entregue_em). Um slot so.
--
-- O QUE ESSE SLOT UNICO CAUSAVA, e por que ele deixa de existir:
-- montar o catalogo pelo sistema APAGAVA o arquivo que o marketing
-- tinha enviado, e vice-versa. Bastava alguem clicar no botao de
-- montar por curiosidade para o trabalho do designer sumir — do
-- banco e do bucket, sem volta. Decisao do Lucas em 01/09/2026:
-- guardar as versoes anteriores.
--
-- Agora cada montagem e cada envio e uma LINHA. A versao atual e a
-- mais recente; as outras continuam baixaveis. Nada e apagado por
-- este caminho.
--
-- AS QUATRO COLUNAS DE `catalogos` NAO SAO DERRUBADAS AQUI, e a
-- omissao e deliberada: enquanto o container antigo estiver no ar,
-- ele ainda as consulta em toda leitura de catalogo, e derruba-las
-- junto quebraria a aplicacao no intervalo entre a migracao e o
-- restart. Elas morrem numa migracao 45, depois de o deploy novo
-- estar confirmado.
--
-- Origem: [SYS] — dado operacional do sistema novo. Sem PII de
-- cliente: os nomes aqui sao de staff.
-- ============================================================

CREATE TABLE IF NOT EXISTS catalogo_finais (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  catalogo_id     UUID        NOT NULL REFERENCES catalogos(id) ON DELETE CASCADE,

  -- [SYS] De onde veio esta versao.
  --   IA        = montada aqui dentro, pelo montador de PDF
  --   MARKETING = montada fora e enviada pela tela
  --
  -- O rotulo 'IA' envelheceu mal: a montagem e deterministica e
  -- nenhum modelo desenha a pagina. Ele fica porque e o valor que a
  -- 42 reservou para "montado pelo sistema", e o sentido das duas
  -- opcoes nao mudou. A tela ja diz "Montado pelo sistema".
  origem          TEXT        NOT NULL
                              CHECK (origem IN ('IA', 'MARKETING')),

  -- [SYS] Chave no armazenamento — nunca URL. Ver a porta.
  arquivo_id      TEXT        NOT NULL,
  nome_arquivo    TEXT        NOT NULL,
  mime            TEXT,
  tamanho_bytes   BIGINT,

  -- [SYS] Rotulo de quem enviou. Nulo quando foi o sistema que montou.
  enviado_por     TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leitura padrao: a versao ATUAL de um catalogo, e a lista das
-- anteriores logo abaixo dela. As duas saem deste indice.
CREATE INDEX IF NOT EXISTS idx_catalogo_finais_catalogo
  ON catalogo_finais(catalogo_id, created_at DESC);

COMMENT ON TABLE catalogo_finais IS
  '[SYS] Versoes da peca final de um catalogo. A atual e a mais recente; as anteriores continuam baixaveis.';
