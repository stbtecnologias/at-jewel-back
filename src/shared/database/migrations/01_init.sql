-- ============================================================
-- A.T. JEWEL - Sprint 1 Schema
-- Tabelas necessárias para: POST /erp/produtos
-- ============================================================

-- ------------------------------------------------------------
-- Tabela de controle de idempotência para eventos do ERP Safira.
-- Garante que o mesmo webhook não seja processado duas vezes
-- em caso de retentativa por timeout ou falha de rede.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_eventos_processados (
  -- Identificador interno do registro de controle (UUID gerado pelo banco)
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- ID único do evento enviado pelo ERP Safira.
  -- Usado como chave de deduplicação: se já existe, o evento é ignorado.
  evento_id     UUID NOT NULL UNIQUE,

  -- Tipo da entidade afetada pelo evento (ex: 'produto', 'cliente', 'venda').
  -- Permite filtrar o log por domínio sem inspecionar o payload.
  entidade_tipo VARCHAR(50) NOT NULL,

  -- Momento em que o evento foi processado com sucesso.
  -- Timezone-aware (TIMESTAMPTZ) para evitar ambiguidade horária.
  processado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice auxiliar: a deduplicação consulta evento_id em toda nova requisição,
-- portanto precisa de acesso rápido mesmo que já exista UNIQUE (que cria índice).
-- Mantido explícito para legibilidade e possível uso em queries analíticas.
CREATE INDEX IF NOT EXISTS idx_erp_eventos_evento_id
  ON erp_eventos_processados(evento_id);

-- ------------------------------------------------------------
-- Tabela de produtos sincronizados via webhook do ERP Safira.
-- Campos marcados com [ERP] vêm diretamente do Safira (Aba 01 – Dados Principais).
-- Campos marcados com [SYS] são gerenciados pelo sistema novo.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produtos (
  -- [SYS] Identificador interno do produto (UUID gerado pelo banco).
  -- Desacoplado do código do ERP para permitir cadastro manual futuro.
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- [ERP] Código único do produto no ERP Safira.
  -- Nullable: produtos cadastrados manualmente não terão código ERP.
  -- O índice parcial abaixo garante unicidade apenas quando preenchido.
  codigo_erp            VARCHAR(50) UNIQUE,

  -- [ERP] Categoria do produto (ex: 'JEWEL', 'HOME').
  -- Usada como agrupador principal nos relatórios de estoque e balanço.
  categoria             VARCHAR(50) NOT NULL,

  -- [ERP] Família dentro da categoria (subdivisão de categoria).
  -- Exemplo: categoria='JEWEL', familia='ANEL'.
  familia               VARCHAR(50) NOT NULL,

  -- [ERP] Coleção comercial à qual o produto pertence.
  -- Exemplo: 'Verão 2025', 'Clássicos'.
  colecao               VARCHAR(100),

  -- [ERP] Cor do material ou quilatagem (campo multi-uso no Safira).
  -- Pode representar a cor física ou o tipo de ouro (ex: '18k amarelo').
  cor                   VARCHAR(100),

  -- [ERP] Tamanho do produto.
  -- Relevante para anéis (numeração) e pulseiras/correntes (cm).
  tamanho               VARCHAR(50),

  -- [ERP] Tipo de pedra utilizada na peça (ex: 'Zircônia', 'Esmeralda').
  tipo_pedra            VARCHAR(50),

  -- [ERP] Coleção específica da pedra (agrupador secundário do ERP).
  colecao_pedra         VARCHAR(50),

  -- [ERP] Código ou referência do produto no catálogo do fornecedor.
  -- Facilita recompra e rastreamento de origem sem precisar do cadastro do fornecedor.
  referencia_fornecedor VARCHAR(100),

  -- [ERP] Texto impresso na etiqueta física do produto na loja.
  -- Pode diferir do nome comercial exibido no catálogo digital.
  descricao_etiqueta    VARCHAR(255),

  -- [ERP] Peso do produto em gramas com 4 casas decimais.
  -- Alta precisão necessária para ourivesaria (peças podem variar em miligramas).
  peso_gramas           DECIMAL(10,4),

  -- [ERP] Unidade de medida do produto (ex: 'UN' para unidade, 'g' para gramas).
  unidade               VARCHAR(20) NOT NULL,

  -- [ERP] Valor de aquisição do produto junto ao fornecedor (preço de compra).
  -- Distinto do custo: pode ser o valor da nota fiscal de entrada.
  valor_compra          DECIMAL(15,2),

  -- [ERP] Custo cadastrado ou médio do produto conforme o ERP Safira.
  -- Usado como base para cálculo da margem.
  -- ⚠️ Pendente: distinguir custo cadastrado vs. custo médio vs. último custo (ver US02).
  valor_custo           DECIMAL(15,2),

  -- [ERP] Margem de lucro em percentual sobre o custo.
  -- Exemplo: 40.00 representa 40%.
  margem_percentual     DECIMAL(5,2),

  -- [ERP] Preço de venda ao consumidor final.
  -- Obrigatório: todo produto deve ter preço para aparecer no catálogo e nas vendas.
  valor_venda           DECIMAL(15,2) NOT NULL,

  -- [ERP] Observações gerais sobre o produto (Aba 03 do ERP Safira).
  -- Campo livre utilizado pela equipe para notas internas.
  observacao            TEXT,

  -- [ERP] URL da foto do produto armazenada no ERP Safira (Aba 06).
  -- Formato JPEG, resolução máxima observada: 1536×1024 px.
  -- Diferente da foto usada no catálogo de marketing.
  foto_url              VARCHAR(500),

  -- [SYS] Indica se o produto está ativo e disponível para operações.
  -- Produtos inativos não aparecem em vendas, consignações ou catálogo.
  ativo                 BOOLEAN NOT NULL DEFAULT TRUE,

  -- [SYS] Timestamp de criação do registro no sistema novo.
  -- TIMESTAMPTZ garante consistência independente do timezone do servidor.
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- [SYS] Timestamp da última atualização (qualquer campo).
  -- Atualizado pela aplicação a cada PATCH/PUT no produto.
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice composto para relatórios de estoque que agrupam por categoria e família.
-- Cobre os filtros principais do Relatório 01 – Posição de Estoque e Curva ABC.
CREATE INDEX IF NOT EXISTS idx_produto_categoria
  ON produtos(categoria, familia);

-- Índice parcial: só indexa linhas onde codigo_erp está preenchido.
-- Evita indexar NULLs de produtos cadastrados manualmente, reduzindo tamanho do índice.
CREATE INDEX IF NOT EXISTS idx_produto_codigo_erp
  ON produtos(codigo_erp)
  WHERE codigo_erp IS NOT NULL;
