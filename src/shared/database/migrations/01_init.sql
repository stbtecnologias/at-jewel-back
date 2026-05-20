-- ============================================================
-- A.T. JEWEL - Sprint 1 Schema
-- Tabelas necessárias para: POST /erp/produtos
-- ============================================================

-- Idempotência para eventos do ERP Safira
CREATE TABLE IF NOT EXISTS erp_eventos_processados (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  evento_id     UUID NOT NULL UNIQUE,
  entidade_tipo VARCHAR(50) NOT NULL,
  processado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_eventos_evento_id
  ON erp_eventos_processados(evento_id);

-- Produtos (sincronizados via webhook do Safira)
CREATE TABLE IF NOT EXISTS produtos (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_erp            VARCHAR(50) UNIQUE,
  categoria             VARCHAR(50) NOT NULL,
  familia               VARCHAR(50) NOT NULL,
  colecao               VARCHAR(100),
  cor                   VARCHAR(100),
  tamanho               VARCHAR(50),
  tipo_pedra            VARCHAR(50),
  colecao_pedra         VARCHAR(50),
  referencia_fornecedor VARCHAR(100),
  descricao_etiqueta    VARCHAR(255),
  peso_gramas           DECIMAL(10,4),
  unidade               VARCHAR(20) NOT NULL,
  valor_compra          DECIMAL(15,2),
  valor_custo           DECIMAL(15,2),
  margem_percentual     DECIMAL(5,2),
  valor_venda           DECIMAL(15,2) NOT NULL,
  observacao            TEXT,
  foto_url              VARCHAR(500),
  ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_produto_categoria
  ON produtos(categoria, familia);

CREATE INDEX IF NOT EXISTS idx_produto_codigo_erp
  ON produtos(codigo_erp)
  WHERE codigo_erp IS NOT NULL;
