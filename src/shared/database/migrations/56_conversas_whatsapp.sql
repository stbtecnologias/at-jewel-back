--- 56 — A FILA DE CONVERSAS A LER (MEL-15)
---
--- A migracao 53 fez o contato virar interacao: quem falou, quando, em que
--- atendimento. O FATO. Esta aqui cuida do que vem depois — a LEITURA da
--- conversa, que e o que faz o atendimento evoluir sozinho.
---
--- ==========================================================================
--- POR QUE UMA FILA, E NAO LER NA HORA QUE A MENSAGEM CHEGA.
---
--- Ler no webhook custaria uma chamada de LLM POR MENSAGEM. Uma conversa de
--- vinte mensagens custaria vinte leituras para chegar na mesma conclusao que
--- uma leitura depois do fim custa. Pior: no meio da conversa nao ha desfecho
--- para extrair — a resposta seria "EM_ANDAMENTO" vinte vezes.
---
--- Entao a mensagem so MARCA a conversa como suja e diz quando reler. A regra
--- e do Lucas, 08/09/2026: uma hora depois de a conversa parar. Mensagem nova
--- empurra o relogio para frente; enquanto elas chegam, nao se le nada.
--- ==========================================================================
---
--- O QUE ESTA TABELA NAO E: um espelho do WhatsApp. Nao ha coluna de texto de
--- mensagem aqui, e isso e deliberado — a decisao da 53 continua valendo, e o
--- conteudo mora no WAHA. O que guardamos e o PONTEIRO (qual conversa) e a
--- MARCA D'AGUA (ate onde ja lemos).
---
--- ==========================================================================
--- POR QUE O NUMERO ENTRA CIFRADO, INCLUSIVE O DESCONHECIDO.
---
--- Esta e a primeira tabela que guarda o numero de quem NAO e cliente. E de
--- proposito: ate 09/09/2026 numero desconhecido era descartado no webhook, e
--- com ele ia embora a cliente nova e a que trocou de telefone — as duas
--- indistinguiveis do entregador e do grupo do bairro.
---
--- Quem separa uma coisa da outra e a leitura, e para ler e preciso saber
--- QUAL conversa abrir. Dai o numero ficar aqui. Fica pelo mesmo tratamento
--- do telefone de cliente: AES-256-GCM na coluna, HMAC no lado para busca.
--- Numero julgado como assunto que nao e da loja vira IGNORADA e para de ser
--- lido — mas a linha fica, senao ele voltaria para a fila na mensagem
--- seguinte, para sempre.
--- ==========================================================================

CREATE TYPE estado_conversa_whatsapp AS ENUM (
  -- Tem mensagem nova desde a ultima leitura. `ler_em` diz quando reler.
  'AGUARDANDO',
  -- Lida ate `lida_ate`, sem novidade. Volta para AGUARDANDO na proxima
  -- mensagem.
  'LIDA',
  -- A leitura disse que o assunto nao e da loja. Continua sendo reavaliada,
  -- mas devagar — ver INTERVALO_REAVALIACAO_H no caso de uso.
  'IGNORADA'
);

CREATE TABLE conversas_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A dona do numero em que a conversa passou. CASCADE porque a fila nao
  -- sobrevive a vendedora: sem a sessao dela nao ha o que ler.
  vendedora_id UUID NOT NULL REFERENCES vendedoras(id) ON DELETE CASCADE,

  -- O chat no WAHA ("5585...@c.us"), cifrado. E o unico jeito de reabrir a
  -- conversa na hora de ler.
  chat_id TEXT NOT NULL,
  chat_id_hash TEXT NOT NULL,

  -- Preenchidos quando se sabe de quem e. Ficam nulos enquanto o numero for
  -- desconhecido — que e justamente o caso que esta tabela veio resolver.
  cliente_id UUID NULL REFERENCES clientes(id) ON DELETE SET NULL,
  atendimento_id UUID NULL REFERENCES atendimentos(id) ON DELETE SET NULL,
  -- O lead aberto pela leitura, quando o numero era desconhecido e o assunto
  -- era joia. SET NULL e nao CASCADE: apagar o lead nao pode apagar a marca
  -- d'agua, senao a conversa inteira seria relida do zero.
  lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL,

  -- Quando passou a ultima mensagem. E daqui que sai `ler_em`.
  ultima_mensagem_em TIMESTAMPTZ NOT NULL,

  -- A MARCA D'AGUA. Nulo = nunca lida. So anda depois que a leitura deu
  -- certo: falha de LLM deixa a marca onde estava e a conversa volta inteira
  -- na proxima rodada, em vez de sumir um pedaco em silencio.
  lida_ate TIMESTAMPTZ NULL,

  -- Quando reler. NULO = nada pendente, e e o que o indice parcial abaixo
  -- aproveita: a varredura so enxerga quem tem hora marcada.
  ler_em TIMESTAMPTZ NULL,

  estado estado_conversa_whatsapp NOT NULL DEFAULT 'AGUARDANDO',

  -- Falhas seguidas de leitura. Existe para a varredura poder desistir de uma
  -- conversa que quebra sempre, em vez de tentar de hora em hora para sempre.
  tentativas SMALLINT NOT NULL DEFAULT 0,

  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Uma linha por conversa. O webhook faz UPSERT por esta chave — sem ela,
  -- cada mensagem criaria uma fila nova da mesma conversa.
  CONSTRAINT uq_conversas_whatsapp_chat UNIQUE (vendedora_id, chat_id_hash)
);

-- A CONSULTA DA VARREDURA, e a unica que roda de hora em hora. Parcial porque
-- a esmagadora maioria das linhas tem `ler_em` nulo — conversa ja lida nao
-- volta para a fila ate chegar mensagem nova.
CREATE INDEX idx_conversas_whatsapp_fila
  ON conversas_whatsapp (ler_em)
  WHERE ler_em IS NOT NULL;

-- Para a tela e para o vinculo posterior: "as conversas da Marina".
CREATE INDEX idx_conversas_whatsapp_vendedora
  ON conversas_whatsapp (vendedora_id, ultima_mensagem_em DESC);

COMMENT ON TABLE conversas_whatsapp IS
  'Fila de conversas do numero corporativo a serem lidas pela IA (MEL-15). Guarda ponteiro e marca dagua, nunca o texto das mensagens.';
COMMENT ON COLUMN conversas_whatsapp.lida_ate IS
  'Marca dagua: so avanca apos leitura bem-sucedida.';
COMMENT ON COLUMN conversas_whatsapp.chat_id IS
  'Cifrado AES-256-GCM. Inclui numero de quem nao e cliente — ver cabecalho da migracao.';
