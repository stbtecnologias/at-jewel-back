--- 71 — OS ALERTAS: PRAZO CONFIGURAVEL E MEMORIA DO QUE JA FOI AVISADO
---
--- ANA-19, ANA-20 e ANA-21 do documento da Anastasia.
---
--- ==========================================================================
--- DUAS TABELAS PORQUE SAO DUAS PERGUNTAS DIFERENTES.
---
---   `alerta_regras`   QUANDO avisar, e se este alerta esta ligado
---   `alerta_disparos` O QUE JA FOI AVISADO, para nao repetir
---
--- Junta-las pareceria economia e criaria o defeito classico: a configuracao
--- de um alerta seria reescrita a cada disparo, e mudar o prazo apagaria o
--- historico de quem ja foi avisado — fazendo todo mundo ser avisado de novo
--- no minuto seguinte a gestao ajustar um numero na tela.
--- ==========================================================================

--- ==========================================================================
--- AS REGRAS.
---
--- Cada linha e um TIPO de alerta com o seu prazo. A tabela nasce populada:
--- um alerta sem regra nao dispara, e deixar a tabela vazia significaria
--- entregar o recurso desligado sem ninguem saber.
---
--- `ativo` existe separado do prazo porque desligar um alerta e diferente de
--- adia-lo para sempre. "Nao quero ser avisado disso" e uma decisao; prazo de
--- 9999 dias e uma gambiarra que ninguem entende seis meses depois.
--- ==========================================================================
CREATE TABLE IF NOT EXISTS alerta_regras (
  chave          varchar(60) PRIMARY KEY,
  descricao      text        NOT NULL,
  ativo          boolean     NOT NULL DEFAULT true,
  --- O prazo em MINUTOS, e nao em dias: "sem primeira resposta ha 2 horas" e
  --- um alerta legitimo, e em dias ele nao seria expressavel. Quem mostra na
  --- tela converte; o banco guarda a unidade menor.
  prazo_minutos  integer     NOT NULL CHECK (prazo_minutos > 0),
  --- Quanto tempo esperar antes de avisar DE NOVO sobre a mesma coisa.
  --- Sem isto, um lead parado geraria um aviso por rodada, para sempre.
  repetir_apos_minutos integer CHECK (repetir_apos_minutos IS NULL OR repetir_apos_minutos > 0),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

--- ==========================================================================
--- OS PRAZOS DE PARTIDA, E DE ONDE VIERAM.
---
--- `lead_sem_resposta`: 120 minutos. O lead nasce NOVO e so sai de la quando
--- a vendedora responde (ANA-03). Duas horas e o ponto em que a demora deixa
--- de ser "estava ocupada" e vira "ninguem viu".
---
--- `lead_parado`: 7 dias (10080 min) — o mesmo numero do estado PARADO,
--- decidido pelo Lucas em 29/09. Os dois TEM de ser iguais: se o alerta
--- disparasse antes, avisaria sobre lead que o sistema ainda considera ativo.
---
--- `repetir_apos` NULO em `lead_sem_resposta` e deliberado: e um aviso de
--- urgencia, e repeti-lo nao acrescenta informacao — quem nao agiu na
--- primeira nao vai agir na terceira, e o ruido faz o proximo ser ignorado.
--- ==========================================================================
INSERT INTO alerta_regras (chave, descricao, prazo_minutos, repetir_apos_minutos)
VALUES
  ('lead_sem_resposta',
   'Lead que chegou e ninguém respondeu ainda',
   120, NULL),
  ('lead_parado',
   'Lead sem mensagem nova, e sem desfecho',
   10080, 10080),
  ('meta_em_risco',
   'Vendedora longe da meta com o mês acabando',
   1440, 1440),
  ('queda_de_desempenho',
   'Vendedora vendendo bem menos que o próprio histórico',
   10080, 10080)
ON CONFLICT (chave) DO NOTHING;

--- ==========================================================================
--- OS DISPAROS.
---
--- Uma linha por "este alerta, sobre esta coisa, foi mandado nesta hora".
--- E o que responde a ANA-21 e o que impede a repeticao.
---
--- `alvo_tipo` + `alvo_id` em vez de FK: o alvo e as vezes um lead, as vezes
--- uma vendedora, as vezes a loja inteira. Uma FK por tipo exigiria uma
--- coluna por tipo, quase sempre nula, e uma restricao CHECK para garantir
--- que exatamente uma esta preenchida — complexidade que so se paga quando
--- alguem precisa de JOIN, e ninguem precisa: este registro e lido por chave,
--- nunca cruzado.
--- ==========================================================================
CREATE TABLE IF NOT EXISTS alerta_disparos (
  id         bigserial PRIMARY KEY,
  regra      varchar(60) NOT NULL REFERENCES alerta_regras(chave) ON DELETE CASCADE,
  alvo_tipo  varchar(20) NOT NULL,
  alvo_id    varchar(64) NOT NULL,
  --- Para quem foi. Texto e nao FK: o destinatario pode ser um admin, uma
  --- vendedora ou um canal, e guardar QUEM RECEBEU importa mais do que poder
  --- fazer JOIN com a tabela dele.
  destinatario text,
  enviado_em timestamptz NOT NULL DEFAULT now()
);

--- O indice que a checagem de repeticao usa: "ja avisei sobre este alvo, por
--- esta regra, recentemente?". Sem ele a checagem varre a tabela inteira a
--- cada candidato, a cada rodada.
CREATE INDEX IF NOT EXISTS idx_alerta_disparos_recente
  ON alerta_disparos (regra, alvo_tipo, alvo_id, enviado_em DESC);

COMMENT ON TABLE alerta_regras IS
  'Quando cada alerta dispara e se está ligado (ANA-19/20). Nasce populada: alerta sem regra não dispara.';
COMMENT ON TABLE alerta_disparos IS
  'O que já foi avisado, para não repetir (ANA-21). Lido por chave, nunca cruzado.';
COMMENT ON COLUMN alerta_regras.repetir_apos_minutos IS
  'NULL = avisa uma vez só. Aviso de urgência repetido não acrescenta informação e faz o próximo ser ignorado.';
