-- ============================================================
-- A.T. JEWEL — Migracao 32: Estoque por empresa, grupo e local
--
-- Fecha o pre-requisito anunciado na migracao 27: "a tabela acordada
-- tem chave (empresa, grupo de local, local, produto)".
--
-- O MODELO DO ERP (descrito pelo Lucas em 17/08/2026):
--
--   empresa - grupo estoque - estoque(local) - codproduto - quant.
--
--   001 - Consignado(001)    - Estoque 01 (Armario 01) - 2010 - 02
--   001 - Disponivel         - Estoque 02 (Armario 02) - 2010 - 08
--   001 - Consignado_Cliente - Ana                     - 2010 - 01
--
--   E saldo por localizacao. As quatro partes juntas identificam uma
--   quantidade; nenhuma sozinha basta.
--
-- PARTIDA DOBRADA — por que a quantidade pode ser NEGATIVA:
--   O ERP lanca estoque em duas pernas. Ao pegar uma peca consignada
--   do fornecedor: +1 no nosso estoque (a peca esta aqui) e -1 no
--   fornecedor (devemos essa peca a ele). O negativo NAO e erro, e a
--   obrigacao. Por isso NAO existe CHECK (quantidade >= 0): esta
--   tabela e espelho, e espelho nao corrige.
--
-- GRUPO E LOCAL SAO COISAS DIFERENTES:
--   `grupo` descreve a SITUACAO do saldo (disponivel, consignado);
--   so o `local` e lugar de fato. Estrutura identica nao as torna a
--   mesma coisa — foi avaliado unificar as duas tabelas com um
--   discriminador (tipo 1/2) e descartado: a FK deixaria de impedir
--   que um local fosse gravado na coluna de grupo, em silencio.
--
-- O QUE CABE EM "LOCAL" — mais do que lugar:
--   A mesma coluna guarda `Armario 01` (lugar nosso), `Ana` (pessoa)
--   e `Fornecedor 1` (empresa a quem devemos). No ERP convive porque
--   tudo e texto. Aqui fornecedores, clientes e vendedoras sao
--   tabelas com UUID — gravar "Fornecedor 1" como texto perderia o
--   vinculo, e nao daria para responder "o que devo a esse
--   fornecedor?" nem "o que a Ana esta com nossa peca?" sem casar por
--   nome. Dai as quatro colunas de local, com FK de verdade e CHECK
--   garantindo exatamente uma preenchida. O nome `local` acompanha o
--   vocabulario do ERP de proposito: e como o Lucas e o Alessandro se
--   referem a essa dimensao, e evita traduzir termo na hora de conferir
--   uma divergencia de saldo.
--
-- Sem CREATE TYPE — integralmente re-executavel.
-- Aditiva/idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- Grupos de estoque — a SITUACAO do saldo
-- Ex.: Disponivel · Consignado · Consignado_Cliente
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grupos_estoque (
  -- [SYS] Identificador interno, desacoplado do ERP.
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [ERP] ID da linha na tabela do ERP Safira. E a chave da tabela LA:
  -- imutavel, e por isso a chave de idempotencia da sincronizacao.
  id_erp         VARCHAR(50)  UNIQUE,

  -- [ERP] Codigo de NEGOCIO, que a loja escolhe e pode trocar. Serve para
  -- exibir e conferir — nao para identificar na sincronizacao.
  codigo_erp     VARCHAR(50)  UNIQUE,

  -- [ERP] Nome exibido. E o que aparece nas telas e nos relatorios.
  nome           VARCHAR(255) NOT NULL,

  -- [SYS] Desativar preserva o historico de saldo que aponta para ele.
  ativo          BOOLEAN      NOT NULL DEFAULT TRUE,

  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Locais de estoque — lugar FISICO nosso
-- Ex.: Armario 01 · Armario 02 · Cofre
--
-- So lugares. Pessoa e fornecedor NAO entram aqui: na tabela `estoque`
-- eles tem coluna propria, com FK para a entidade de verdade.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locais_estoque (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  id_erp         VARCHAR(50)  UNIQUE,
  codigo_erp     VARCHAR(50)  UNIQUE,
  nome           VARCHAR(255) NOT NULL,
  ativo          BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Saldo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estoque (
  -- [SYS] Identificador interno.
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [ERP] ID da linha de saldo na tabela do ERP — cada linha tem o seu.
  -- E a chave da tabela LA, imutavel, e por isso a chave de idempotencia
  -- da sincronizacao: com ele o integrador manda UM campo em vez de
  -- resolver as quatro dimensoes.
  --
  -- POR QUE NAO O codigo_erp: o codigo e escolhido pela loja e pode ser
  -- TROCADO. Se a sincronizacao dependesse dele, renomear no Safira faria
  -- o upsert nao achar o registro antigo e criar um segundo — a linha
  -- velha viraria saldo fantasma. O id nao muda.
  --
  -- Nao substitui a UNIQUE composta abaixo: as duas convivem. O id diz
  -- "esta linha e aquela linha de la"; a composta impede que dois ids
  -- diferentes apontem para a MESMA combinacao, que seria saldo duplicado
  -- com dois nomes.
  id_erp           VARCHAR(50) UNIQUE,

  -- [ERP] Codigo de NEGOCIO. Exibicao e conferencia, nao identidade.
  codigo_erp       VARCHAR(50) UNIQUE,

  -- [ERP] De quem e o saldo. Empresas compartilham o mesmo cadastro de
  -- produtos com estoques separados (ver migracao 27).
  empresa_id       UUID    NOT NULL REFERENCES empresas(id),

  -- [ERP] Em que situacao o saldo esta.
  grupo_estoque_id UUID    NOT NULL REFERENCES grupos_estoque(id),

  -- [ERP] Qual peca.
  produto_id       UUID    NOT NULL REFERENCES produtos(id),

  -- [ERP] LOCAL: onde esta, ou com quem esta. Exatamente UMA das
  -- quatro. Sem ON DELETE de proposito — o banco passa a impedir apagar
  -- cliente ou vendedora que esteja com peca nossa. E uma regra nova de
  -- operacao (aqui cliente e vendedora sao apagados de verdade, nao
  -- desativados), mas o contrario deixaria saldo orfao apontando para
  -- ninguem.
  local_estoque_id UUID REFERENCES locais_estoque(id),
  fornecedor_id    UUID REFERENCES fornecedores(id),
  cliente_id       UUID REFERENCES clientes(id),
  vendedora_id     UUID REFERENCES vendedoras(id),

  -- [ERP] Quantidade. NEGATIVO E ESTADO VALIDO — ver partida dobrada no
  -- cabecalho. Deliberadamente sem CHECK de nao-negatividade.
  quantidade       INTEGER     NOT NULL DEFAULT 0,

  -- [SYS] Quando este numero foi atualizado pela ultima vez. Responde
  -- "esse saldo e de quando?". Sem ele, saldo de hoje e saldo de tres
  -- semanas atras tem a mesma cara, e uma sincronizacao que parou de
  -- rodar fica invisivel.
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),

  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Exatamente um local. Zero deixaria o saldo sem lugar; duas tornariam
  -- a chave ambigua.
  CONSTRAINT chk_estoque_local CHECK (
      (local_estoque_id IS NOT NULL)::int
    + (fornecedor_id    IS NOT NULL)::int
    + (cliente_id       IS NOT NULL)::int
    + (vendedora_id     IS NOT NULL)::int = 1
  ),

  -- Colunas DERIVADAS pelo banco. Existem por um motivo tecnico: a
  -- UNIQUE precisa do local, mas tres das quatro colunas estao sempre
  -- nulas — e no Postgres nulos nunca colidem entre si, entao a restricao
  -- nao pegaria nada. Colapsando o local em (tipo, id), a UNIQUE volta a
  -- valer. Ninguem escreve nelas.
  --
  -- LOCAL_TIPO diz QUAL das quatro colunas veio preenchida:
  --   LOCAL      lugar fisico nosso (local_estoque_id)
  --   FORNECEDOR CLIENTE  VENDEDORA   quem esta com a peca, ou a quem
  --                                   devemos, no caso do saldo negativo
  local_tipo TEXT GENERATED ALWAYS AS (
    CASE
      WHEN local_estoque_id IS NOT NULL THEN 'LOCAL'
      WHEN fornecedor_id    IS NOT NULL THEN 'FORNECEDOR'
      WHEN cliente_id       IS NOT NULL THEN 'CLIENTE'
      ELSE 'VENDEDORA'
    END
  ) STORED,

  local_id UUID GENERATED ALWAYS AS (
    COALESCE(local_estoque_id, fornecedor_id, cliente_id, vendedora_id)
  ) STORED,

  -- O coracao do desenho. Garante UMA linha por combinacao e e o alvo do
  -- ON CONFLICT que torna a sincronizacao idempotente:
  --
  --   INSERT INTO estoque (...) VALUES (...)
  --   ON CONFLICT ON CONSTRAINT uq_estoque_chave
  --   DO UPDATE SET quantidade = EXCLUDED.quantidade,
  --                 atualizado_em = now();
  --
  -- O ERP manda a foto quantas vezes quiser; nunca duplica.
  CONSTRAINT uq_estoque_chave
    UNIQUE (empresa_id, grupo_estoque_id, produto_id, local_tipo, local_id)
);

-- "Onde esta esta peca?" — a pergunta mais frequente, e a que a Elena
-- (catalogo/estoque) faria.
CREATE INDEX IF NOT EXISTS idx_estoque_produto
  ON estoque (produto_id);

-- "O que tem neste armario / com esta pessoa?" — indices parciais: so
-- as linhas daquele local, que sao uma fracao do total.
CREATE INDEX IF NOT EXISTS idx_estoque_local
  ON estoque (local_estoque_id) WHERE local_estoque_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_fornecedor
  ON estoque (fornecedor_id) WHERE fornecedor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_cliente
  ON estoque (cliente_id) WHERE cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_vendedora
  ON estoque (vendedora_id) WHERE vendedora_id IS NOT NULL;

-- "O que esta com terceiros?" — saldo negativo e o que devemos.
-- Indice parcial: em operacao normal e a minoria das linhas.
CREATE INDEX IF NOT EXISTS idx_estoque_negativo
  ON estoque (produto_id, quantidade) WHERE quantidade < 0;

-- ------------------------------------------------------------
-- NOTA sobre `produtos.estoque_atual` (migracao 16)
--
-- Aquela coluna e um inteiro unico por produto, sem dimensao de local,
-- sem escritor pelo webhook do ERP (`ErpProdutoDto` nao traz o campo) —
-- esta em 0 em producao. Com `estoque` existindo, passam a haver dois
-- lugares dizendo quantidade. A recomendacao e aposenta-la; enquanto a
-- decisao nao vier, ela permanece intacta e ninguem deve trata-la como
-- fonte de verdade.
--
-- EM ABERTO com o Alessandro (nao bloqueiam esta tabela):
--   1. Saldo ou movimento? Se for movimento, esta tabela vira uma view
--      sobre `estoque_movimentos` e o saldo passa a ser consequencia.
--   2. Quem e o dono do estoque? Se for o ERP — provavel, por ser o
--      sistema fiscal — o CRM NUNCA escreve aqui, e em divergencia o ERP
--      esta certo por definicao.
--   3. Integracao de mao unica ou dupla?
--   4. Toda entrada tem contrapartida, ou so a consignacao? Se todas
--      tiverem, a soma das linhas de um produto tende a zero — e isso
--      vira verificacao de integridade de graca.
-- ------------------------------------------------------------
