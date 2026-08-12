-- ============================================================
-- A.T. JEWEL — Migracao 26: Cadastro de Fornecedores
--
-- Levantado na reuniao STB <> CONEXA de 11/08/2026 (integracao do
-- ERP Safira). Ate aqui fornecedor nao existia como entidade: havia
-- apenas `produtos.referencia_fornecedor VARCHAR(100)`, texto livre,
-- descrito na migracao 01 como servindo "sem precisar do cadastro do
-- fornecedor".
--
-- CONSEQUENCIA JA ATIVA DISSO:
--   /analytics/giro-estoque agrupa por aquela string
--   (giroEstoquePorFornecedor). Variacao de grafia — "Antica" e
--   "Antica" com acento — vira dois fornecedores no relatorio.
--
-- PRE-REQUISITO DE:
--   Consignacao de fornecedor. No modelo acordado na reuniao, peca
--   pega emprestada do fornecedor gera saldo NEGATIVO no grupo de
--   local dele. Sem esta tabela nao ha a quem atribuir esse saldo.
--
-- ESTRUTURA: espelha `clientes`, conforme o Alessandro descreveu —
--   "o cliente pode colocar as mesmas informacoes do fornecedor".
--
-- PRIVACIDADE:
--   Fornecedor e majoritariamente PJ, e razao social, CNPJ e endereco
--   comercial sao dados publicos. Mas o campo de documento e o mesmo
--   para CPF e CNPJ (assim e no ERP), e existe fornecedor pessoa
--   fisica. Por isso `cpf_cnpj`, `telefone` e `email` sao cifrados em
--   AES-256-GCM pelo mesmo transformer de `clientes`/`vendedoras`.
--   O endereco fica em claro por decisao consciente: permite analise
--   regional de compra sem decifrar a base. Risco residual aceito —
--   fornecedor PF fica com endereco residencial legivel.
--
-- SEM COLUNA DE HASH:
--   Diferente de `clientes.telefone_1_hash`, aqui nao ha
--   `cpf_cnpj_hash`. A chave de deduplicacao da ingestao e
--   `codigo_erp`, que ja e UNIQUE — e o Alessandro registrou que o
--   documento frequentemente vem vazio ("e segmento que o pessoal nao
--   gosta muito de se identificar"), entao nunca seria identificador
--   confiavel. Se um dia for preciso buscar por documento, a coluna
--   de hash entra como migracao aditiva.
--
-- NORMALIZACAO — GRAVAR SEM MASCARA:
--   `cpf_cnpj`, `telefone` e `cep` sao gravados apenas com digitos.
--   A mascara e apresentacao e pertence ao front. Guardar formatado
--   faz "11.222.333/0001-44" e "11222333000144" virarem registros
--   distintos para o banco. A camada de aplicacao normaliza na
--   entrada (mesma regra de `normalizarTelefone`: replace(/\D/g,'')).
--
--   ATENCAO — divergencia conhecida no codigo existente:
--   `criar-vendedora.use-case.ts` normaliza o telefone apenas para
--   calcular o hash e grava o valor cifrado COMO VEIO. Aqui nao se
--   repete isso: normalizar antes de cifrar tambem.
--
-- `ativo` E BOOLEAN, como em produtos/clientes/vendedoras/vendas. Se
-- o ERP enviar 'A'/'S'/'Ativo', a conversao acontece no DTO de
-- ingestao — o banco guarda o significado, nao o dialeto do ERP.
--
-- Reaproveita o ENUM `tipo_pessoa` ('fisica','juridica') criado na
-- migracao 03 — por isso esta migracao nao tem CREATE TYPE e e
-- integralmente re-executavel.
--
-- Aditiva/idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS fornecedores (
  -- [SYS] Identificador interno, desacoplado do ERP.
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [ERP] Codigo do fornecedor no ERP Safira. Chave de idempotencia
  -- da sincronizacao. Nullable: fornecedor cadastrado manualmente
  -- (pre-integracao) nao tem codigo.
  codigo_erp          VARCHAR(50)  UNIQUE,

  -- [ERP] Razao social (PJ) ou nome completo (PF).
  nome                VARCHAR(255) NOT NULL,

  -- [ERP] Nome fantasia. Ex.: razao "Antica Comercio de Objetos e
  -- Artigos", fantasia "Antica".
  nome_fantasia       VARCHAR(255),

  -- [ERP] Pessoa fisica ou juridica. Default 'juridica' — ao
  -- contrario de `clientes`, que assume 'fisica'. Fornecedor de
  -- joalheria e quase sempre empresa.
  tipo_pessoa         tipo_pessoa  NOT NULL DEFAULT 'juridica',

  -- [ENCRYPTED] CPF ou CNPJ, campo unico como no ERP. `tipo_pessoa`
  -- diz qual dos dois e; o comprimento tambem (11 x 14 digitos).
  -- Somente digitos. TEXT e nao numerico: CPF pode comecar com zero.
  cpf_cnpj            TEXT,

  -- [ERP] Inscricao estadual. Preenchimento irregular no ERP.
  inscricao_estadual  VARCHAR(30),

  -- [ENCRYPTED] Telefone de contato. Somente digitos.
  telefone            TEXT,

  -- [ENCRYPTED] E-mail de contato. Nao foi citado na reuniao —
  -- incluido por simetria com `clientes` e por servir a recompra.
  -- Pode nascer sem uso se o ERP nao enviar.
  email               TEXT,

  -- [ERP] Endereco. Em claro por decisao consciente (ver cabecalho).
  logradouro          VARCHAR(255),
  numero              VARCHAR(20),
  complemento         VARCHAR(100),
  bairro              VARCHAR(100),
  cidade              VARCHAR(100),

  -- [ERP] UF com duas letras. CHAR(2) e o suficiente e evita lixo.
  estado              CHAR(2),

  -- [ERP] CEP somente digitos, sem hifen — 8 caracteres.
  cep                 VARCHAR(8),

  -- [ERP] Observacao livre. Item da ata: "adicionar um campo de
  -- observacao ao cadastro de clientes e fornecedores". Em claro,
  -- diferente de `clientes.observacao_geral` que e cifrada — ali o
  -- campo descreve uma pessoa fisica; aqui, uma relacao comercial.
  -- Sanitizado na camada de aplicacao antes de persistir.
  observacao          TEXT,

  -- [SYS] Desligamento suave. Fornecedor inativo nao aparece em
  -- selecao de compra nem em consignacao nova, mas o historico fica.
  ativo               BOOLEAN      NOT NULL DEFAULT TRUE,

  -- [SYS] Auditoria minima. Sem trigger de updated_at: a camada de
  -- aplicacao mantem `atualizado_em` via @UpdateDateColumn, alinhado
  -- a 09_vendas.sql, 15_defeitos.sql e 24_consignacoes.sql.
  criado_em           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Lookup por codigo ERP — idempotencia da sincronizacao. Indice
-- parcial: nao indexa fornecedor cadastrado manualmente (codigo nulo).
CREATE INDEX IF NOT EXISTS idx_fornecedores_codigo_erp
  ON fornecedores(codigo_erp)
  WHERE codigo_erp IS NOT NULL;

-- Busca por nome na tela de cadastro. Predicado tipico e
-- `WHERE ativo = TRUE ORDER BY nome`.
CREATE INDEX IF NOT EXISTS idx_fornecedores_nome
  ON fornecedores(nome)
  WHERE ativo = TRUE;


-- ------------------------------------------------------------
-- Permissoes granulares (RF-USU-01). SUPERADMIN ja possui '*'.
-- Segue o padrao de seed incremental das migracoes 22, 24 e 25:
-- chave nova do catalogo concedida aos papeis pertinentes via INSERT
-- idempotente. O catalogo canonico em codigo fica em
-- src/modules/auth/domain/permissions.ts — sem registrar la, a chave
-- funciona no guard mas nao aparece na tela de Papeis.
--
--   fornecedores:read  -> gestao e estoque (precisam ver a origem da peca)
--   fornecedores:write -> gestao (cadastro e decisao comercial)
-- ------------------------------------------------------------
INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',      'fornecedores:read'), ('ADMIN',   'fornecedores:write'),
  ('GERENTE',    'fornecedores:read'), ('GERENTE', 'fornecedores:write'),
  ('ESTOQUISTA', 'fornecedores:read')
ON CONFLICT DO NOTHING;
