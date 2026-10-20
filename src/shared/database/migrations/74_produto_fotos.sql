--- 74 — AS FOTOS DA PECA
---
--- RF33, pedido do Lucas em 20/10/2026: a peca passa a ter mais de uma foto,
--- enviadas pelo painel ou pelo WhatsApp, com uma delas marcada como capa.
---
--- ==========================================================================
--- POR QUE TABELA, E NAO COLUNA.
---
--- A peca tem hoje DOIS lugares para imagem, e cada um guarda UM arquivo:
--- `produtos.foto_url`, que vem do ERP e e servida pela Conexa, e
--- `produtos.foto_arquivo_id`, que e nossa e ganha da do ERP. Guardar varias
--- e linha, nao coluna.
---
--- E `catalogo_fotos` nao serve: la a foto e presa a UM catalogo
--- (`catalogo_id` obrigatorio). A foto da peca existe antes de qualquer
--- catalogo e vale para todos eles.
--- ==========================================================================
---
--- MEDIDO EM 20/10/2026, e e o que da tamanho ao requisito:
---
---   produtos ativos ................................ 7.304
---   com `foto_url` do ERP .......................... 7.304  (todas)
---   com foto NOSSA (`foto_arquivo_id`) ............. 0
---   joias com saldo ................................ 320
---   com URL cadastrada ............................. 247
---   que a Conexa RESPONDE .......................... 55
---
--- Ou seja: 100% das imagens vem de fora e 78% das cadastradas nao respondem.
--- O caminho da foto propria existe desde a migracao 47 e nunca foi usado —
--- nao ha nenhuma conta de ESTOQUISTA ou MARKETING em producao, que sao os
--- papeis de quem fotografa.

CREATE TABLE IF NOT EXISTS produto_fotos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  produto_id   uuid NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,

  --- A chave no armazenamento (`produtos/<CODIGO>/...`), e NAO o arquivo.
  ---
  --- E texto solto de proposito: a MESMA chave pode aparecer em pecas
  --- diferentes, e e isso que atende o RF34 — a mesma imagem anexada a mais
  --- de uma peca — sem tabela de ligacao e sem outra migracao. Uma linha por
  --- vinculo.
  ---
  --- O PRECO DISSO esta no DELETE: so se apaga o arquivo do disco quando
  --- nenhuma outra linha aponta para ele. Quem remove tem de contar antes.
  arquivo_id   text NOT NULL,

  mime         text NOT NULL,
  bytes        integer NOT NULL,

  --- A capa e a que ganha da foto do ERP: e ela que vai na lista, no catalogo
  --- e na resposta da agente. A garantia de que ha UMA so esta no indice
  --- parcial abaixo, e nao num `if` do servico.
  capa         boolean NOT NULL DEFAULT false,

  --- Ordem de exibicao dentro da peca. A capa vem primeiro de qualquer jeito.
  posicao      integer NOT NULL DEFAULT 0,

  origem       text NOT NULL DEFAULT 'PAINEL'
               CHECK (origem IN ('PAINEL', 'WHATSAPP')),

  --- Quem mandou, resolvido no servidor pelo login ou pelo telefone. Nunca
  --- algo que veio escrito na mensagem.
  enviado_por  text,

  criado_em    timestamptz NOT NULL DEFAULT now()
);

--- A leitura e sempre "as fotos desta peca, capa primeiro".
CREATE INDEX IF NOT EXISTS idx_produto_fotos_peca
  ON produto_fotos (produto_id, capa DESC, posicao, criado_em);

--- UMA CAPA POR PECA, no banco e nao no codigo.
---
--- Indice parcial: so as linhas com `capa = true` entram nele, entao a
--- segunda capa da mesma peca e RECUSADA pelo Postgres. Trocar a capa e
--- desmarcar a antiga e marcar a nova na MESMA transacao.
CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_fotos_uma_capa
  ON produto_fotos (produto_id) WHERE capa;

--- A MESMA IMAGEM NAO ENTRA DUAS VEZES NA MESMA PECA. Mandar a mesma foto de
--- novo e engano comum no WhatsApp, e sem isto a peca ficaria com a imagem
--- repetida na galeria.
CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_fotos_sem_repetir
  ON produto_fotos (produto_id, arquivo_id);

COMMENT ON TABLE produto_fotos IS
  'Fotos da peca (RF33). A capa ganha da foto do ERP; a mesma chave de arquivo pode servir a varias pecas.';
