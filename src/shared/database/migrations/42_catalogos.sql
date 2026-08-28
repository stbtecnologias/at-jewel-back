-- ============================================================
-- A.T. JEWEL — Migracao 42: Catalogos (montador de colecao)
--
-- O catalogo e uma PECA DE CAMPANHA sazonal (ESMERALDA, NEW IN,
-- SUMMER II...), nao uma lista de produtos. O fluxo tem tres tempos:
--
--   1. alguem cria o catalogo na tela com NOME e REFERENCIAS
--      criativas. Nada mais existe ainda — nem foto, nem peca.
--      O catalogo ganha um NUMERO, e e por ele que a agente do
--      WhatsApp o reconhece ("essa foto e do 0042").
--   2. estoque/marketing fotografa a peca pelo WhatsApp. A imagem
--      volta tratada pela IA, com o descritivo, e e aprovada na
--      propria conversa. A foto aprovada entra em catalogo_fotos.
--   3. no fim, ou a IA monta a peca final, ou as fotos sao
--      exportadas para o marketing montar fora e devolver o
--      arquivo pronto — dai as colunas final_*.
--
-- Origem: [SYS] — dado operacional do sistema novo. NAO vem do ERP
-- Safira e NAO contem PII de cliente: os nomes guardados aqui sao de
-- staff (quem fotografou, quem aprovou).
--
-- O DESCRITIVO FICA EM CAMPO, e nao apenas queimado dentro do pixel
-- da imagem. E o que permite conferir o preco antes de publicar, e o
-- que o marketing precisa receber junto quando as fotos sao
-- exportadas — imagem muda obriga alguem a redigitar tudo.
--
-- PRECO: guardamos UM preco (o a vista) e o parcelado e calculado.
-- Regra verificada em 25 de 25 pecas dos catalogos reais: o total
-- parcelado e o a vista dividido por 0,80 (10X) ou por 0,90 (6X).
-- Dois campos de preco seriam duas fontes de verdade para o mesmo
-- numero.
--
-- ARQUIVOS: as colunas *_arquivo_id guardam a CHAVE no armazenamento,
-- nunca o binario nem uma URL absoluta. Hoje o adaptador e disco
-- local; quando virar S3 a chave continua valendo e nenhuma linha
-- desta tabela precisa mudar. Guardar URL absoluta amarraria a base
-- ao host de hoje.
--
-- Estilo alinhado a 25_demandas.sql: TEXT + CHECK em vez de ENUM
-- nativo (evolucao dos valores sem ALTER TYPE), sem trigger de
-- updated_at (TypeORM mantem via @UpdateDateColumn). Aditiva e
-- idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- Numero do catalogo.
--
-- Sequence, e nao MAX(numero)+1: dois cadastros simultaneos pelo
-- MAX gerariam o mesmo numero, e o numero e justamente o que a
-- pessoa digita no WhatsApp para dizer a qual catalogo a foto
-- pertence. Colisao ali manda a foto para a colecao errada.
--
-- Comeca em 1; o formato de quatro digitos e aplicado na escrita.
-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS catalogo_numero_seq AS integer START WITH 1;


CREATE TABLE IF NOT EXISTS catalogos (
  -- [SYS] Identificador interno.
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [SYS] Numero visivel, com zeros a esquerda ('0042'). UNIQUE
  -- porque e a chave que a agente reconhece no WhatsApp.
  numero             TEXT        NOT NULL UNIQUE
                                 DEFAULT lpad(nextval('catalogo_numero_seq')::text, 4, '0'),

  -- [SYS] Nome da colecao, como aparece na capa ("Catalogo Inverno").
  nome               TEXT        NOT NULL,

  -- [SYS] Tema/briefing curto. Segue para a IA junto das referencias.
  tema               TEXT,

  -- [SYS] Proporcao da PECA FINAL montada. Nao vale para as fotos das
  -- pecas, que sao packshot quadrado. Retrato (story) ou paisagem.
  formato            TEXT        NOT NULL DEFAULT '9:16'
                                 CHECK (formato IN ('9:16', '16:9')),

  -- [SYS] Situacao do catalogo.
  --   RASCUNHO  = so referencias; a agente do WhatsApp NAO o oferece
  --   COLETANDO = liberado; entra na lista de "catalogos em aberto"
  --   PUBLICADO = peca final pronta
  --   ENCERRADO = fora de circulacao, mantido para consulta
  status             TEXT        NOT NULL DEFAULT 'RASCUNHO'
                                 CHECK (status IN ('RASCUNHO', 'COLETANDO', 'PUBLICADO', 'ENCERRADO')),

  -- [SYS] Quem criou. SET NULL na exclusao do usuario preserva o
  -- registro operacional (LGPD), e o rotulo mantem o historico legivel.
  criado_por_user_id UUID        REFERENCES admin_users(id) ON DELETE SET NULL,
  criado_por_nome    TEXT        NOT NULL,

  -- [SYS] A peca final montada, quando existir.
  --   IA        = gerada aqui dentro a partir das fotos
  --   MARKETING = montada fora e devolvida para ca
  final_origem       TEXT        CHECK (final_origem IN ('IA', 'MARKETING')),
  final_arquivo_id   TEXT,
  final_nome_arquivo TEXT,
  final_entregue_em  TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A agente consulta "catalogos em aberto" a cada foto recebida.
CREATE INDEX IF NOT EXISTS idx_catalogos_status
  ON catalogos(status);

-- Ordenacao padrao da tela: mais recente primeiro.
CREATE INDEX IF NOT EXISTS idx_catalogos_created_at
  ON catalogos(created_at DESC);


-- ------------------------------------------------------------
-- Referencias criativas.
--
-- E o que a agente le para montar o pedido de imagem: paginas de
-- catalogos anteriores, a fonte, a composicao e observacoes livres.
-- Sem elas a imagem gerada sai sem padrao nenhum.
--
-- `valor` e sempre preenchido — para IMAGEM guarda o nome original do
-- arquivo, que e o que aparece na tela; `arquivo_id` guarda a chave no
-- armazenamento e so existe para IMAGEM.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogo_referencias (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  catalogo_id  UUID        NOT NULL REFERENCES catalogos(id) ON DELETE CASCADE,

  tipo         TEXT        NOT NULL
                           CHECK (tipo IN ('IMAGEM', 'FONTE', 'COMPOSICAO', 'OBSERVACAO')),

  valor        TEXT        NOT NULL,
  arquivo_id   TEXT,
  mime         TEXT,
  ordem        INTEGER     NOT NULL DEFAULT 0,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalogo_referencias_catalogo
  ON catalogo_referencias(catalogo_id, ordem);


-- ------------------------------------------------------------
-- Fotos que compoem o catalogo.
--
-- Uma linha por PECA fotografada. `arquivo_original_id` e a foto crua
-- que chegou do celular e `arquivo_id` e a versao tratada — as duas
-- ficam, porque regerar exige o original e sobrescrever a foto crua
-- torna o erro irreversivel.
--
-- `codigo_erp` e o vinculo com a peca: e a chave DURAVEL (a mesma
-- impressa no catalogo, "CO26185"), e nao o id interno do produto —
-- um resync do ERP Safira recria linhas e orfanaria qualquer foto
-- amarrada ao id. Fica sem FK de proposito: a foto pode chegar antes
-- de a peca existir no ERP, e uma FK faria a mensagem do WhatsApp
-- falhar por causa de um cadastro atrasado.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogo_fotos (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  catalogo_id         UUID        NOT NULL REFERENCES catalogos(id) ON DELETE CASCADE,

  -- [SYS] Ordem dentro do catalogo.
  posicao             INTEGER     NOT NULL DEFAULT 0,

  -- [SYS] Descritivo da peca, na ordem impressa no material.
  codigo_erp          TEXT,
  descricao           TEXT,
  preco_a_vista       NUMERIC(12,2),
  parcelas            INTEGER     CHECK (parcelas IS NULL OR parcelas > 0),

  -- [SYS] Por onde a foto entrou.
  origem              TEXT        NOT NULL DEFAULT 'UPLOAD'
                                  CHECK (origem IN ('WHATSAPP', 'UPLOAD')),

  -- [SYS] Rotulo de quem fotografou (staff). Nao guardamos o telefone.
  remetente           TEXT,

  arquivo_original_id TEXT,
  arquivo_id          TEXT,
  mime                TEXT,

  -- [SYS] Estagio da foto.
  --   RECEBIDA          = chegou, ainda nao processada
  --   NAO_CLASSIFICADA  = chegou sem catalogo identificado
  --   PROCESSANDO       = geracao em andamento
  --   EM_APROVACAO      = aguardando o sim de quem fotografou
  --   APROVADA          = compoe o catalogo
  --   REPROVADA         = fica no historico, fora do catalogo
  status              TEXT        NOT NULL DEFAULT 'APROVADA'
                                  CHECK (status IN ('RECEBIDA', 'NAO_CLASSIFICADA', 'PROCESSANDO',
                                                    'EM_APROVACAO', 'APROVADA', 'REPROVADA')),

  -- [SYS] Quantas geracoes ate esta ser aprovada. 1 = acertou de
  -- primeira. E o numero que mostra, depois de um mes, se o prompt
  -- esta bom ou se esta queimando credito da API.
  versoes             INTEGER     NOT NULL DEFAULT 1,

  aprovado_por        TEXT,
  aprovado_em         TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leitura padrao: as fotos de um catalogo, na ordem.
CREATE INDEX IF NOT EXISTS idx_catalogo_fotos_catalogo
  ON catalogo_fotos(catalogo_id, posicao);

-- Fila de nao-classificadas, consultada pela agente.
CREATE INDEX IF NOT EXISTS idx_catalogo_fotos_status
  ON catalogo_fotos(status);


-- ------------------------------------------------------------
-- Permissoes granulares (RF-USU-01). SUPERADMIN ja possui '*'.
--
--   catalogo:read  -> ver catalogos e as fotos que os compoem
--   catalogo:write -> criar catalogo, referencias e receber fotos
--
-- MARKETING ganha as duas: o papel ja existia desde a migracao 21 com
-- a descricao "Acesso limitado (catalogo)" e ate hoje so tinha
-- `produtos:read` — era um papel sem a tela que lhe da nome.
-- ESTOQUISTA ganha as duas porque e quem fotografa a peca.
-- ------------------------------------------------------------
INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',      'catalogo:read'), ('ADMIN',      'catalogo:write'),
  ('GERENTE',    'catalogo:read'), ('GERENTE',    'catalogo:write'),
  ('MARKETING',  'catalogo:read'), ('MARKETING',  'catalogo:write'),
  ('ESTOQUISTA', 'catalogo:read'), ('ESTOQUISTA', 'catalogo:write')
ON CONFLICT DO NOTHING;
