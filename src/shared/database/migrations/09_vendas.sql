-- ============================================================
-- A.T. JEWEL — Migracao 09: Vendas, Itens e Pagamentos
--
-- Pre-requisito do dashboard gerencial: receita, giro de estoque,
-- ticket medio e metricas por vendedora dependem desta base. As
-- views materializadas de performance da vendedora (mencionadas
-- na migracao 04) so podem existir depois desta tabela.
--
-- Origem hibrida:
--   [ERP] dados da venda em si (data, valores, itens, pagamentos)
--         sincronizados do ERP Safira
--   [SYS] campos operacionais do sistema novo (ativo, data_contato
--         para a visao tabular da reuniao)
--
-- DECISAO DE DESIGN (LGPD, alinhada com agente_eventos):
--   As FKs `cliente_id` e `vendedora_id` usam ON DELETE SET NULL.
--   Atender um pedido de exclusao LGPD (apagar cliente ou desligar
--   vendedora) NAO PODE destruir o historico de vendas — receita e
--   faturamento sao dados contabeis/gerenciais que precisam ser
--   preservados de forma anonimizada. O vinculo cai, a metrica fica.
--
-- SEM PII NESTA TABELA:
--   `vendas` referencia cliente/vendedora apenas por FK. Nome,
--   telefone e email permanecem cifrados em `clientes`/`vendedoras`.
--   NAO copiar PII para ca.
--
-- SNAPSHOT DE PRECO:
--   `itens_venda` guarda valor_unitario e valor_custo_unitario como
--   SNAPSHOT do momento da venda. `produtos.valor_venda` muda com o
--   tempo (reajustes, promocoes); a margem historica precisa do preco
--   praticado na data, nao do preco atual.
--
-- INTEGRIDADE DE VALORES (validada na camada de aplicacao):
--   - vendas.valor_total = vendas.valor_bruto - vendas.valor_desconto
--   - SUM(pagamentos_venda.valor) = vendas.valor_total
--   Estas regras NAO sao constraints (envolvem agregacao cross-row em
--   pagamentos). O RegistrarVendaUseCase as valida dentro da transacao
--   de ingestao. Documentado aqui para o leitor do schema.
-- ============================================================


-- ------------------------------------------------------------
-- ENUMs
-- ------------------------------------------------------------

-- Status da venda. Default 'concluida' porque a maior parte da
-- ingestao do ERP traz vendas ja fechadas. 'pendente' cobre
-- vendas em aberto (reserva, encomenda); 'cancelada' preserva o
-- registro para auditoria sem contar na receita.
CREATE TYPE status_venda AS ENUM ('concluida', 'cancelada', 'pendente');

-- Forma de pagamento conforme meios praticados na A.T. Jewel.
-- 'crediario' = parcelamento direto com a loja; 'outro' e a
-- valvula de escape para meios raros sem poluir o ENUM.
CREATE TYPE forma_pagamento AS ENUM (
  'dinheiro',
  'pix',
  'cartao_credito',
  'cartao_debito',
  'transferencia',
  'crediario',
  'cheque',
  'outro'
);


-- ------------------------------------------------------------
-- Tabela: vendas
--
-- Cabecalho da venda. Itens e pagamentos pendem desta via FK.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendas (
  -- [SYS] Identificador interno, desacoplado do ERP.
  id                            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [ERP] Numero/codigo da venda no ERP Safira. UNIQUE para
  -- idempotencia da sincronizacao: reprocessar o mesmo evento
  -- nao duplica a venda. Nullable porque vendas criadas
  -- manualmente (pre-integracao) podem nao ter codigo ERP.
  codigo_erp                    VARCHAR(50)  UNIQUE,

  -- [ERP/SYS] Cliente da venda. SET NULL no delete (ver cabecalho).
  cliente_id                    UUID         REFERENCES clientes(id) ON DELETE SET NULL,

  -- [ERP/SYS] Vendedora responsavel. SET NULL no delete.
  vendedora_id                  UUID         REFERENCES vendedoras(id) ON DELETE SET NULL,

  -- [ERP] Data/hora da compra. Base de toda consulta por periodo,
  -- calculo de receita e giro.
  data_venda                    TIMESTAMPTZ  NOT NULL,

  -- [SYS] Data do primeiro contato (visao tabular da reuniao).
  -- Backfill posterior — por isso nullable. Usado para medir o
  -- tempo entre contato e fechamento.
  data_contato                  TIMESTAMPTZ,

  -- [ERP] Soma dos itens antes de desconto.
  valor_bruto                   DECIMAL(15,2) NOT NULL,

  -- [ERP] Desconto total aplicado na venda.
  valor_desconto                DECIMAL(15,2) NOT NULL DEFAULT 0,

  -- [ERP] Valor liquido (bruto - desconto). Validado na aplicacao.
  valor_total                   DECIMAL(15,2) NOT NULL,

  -- [ERP] Status da venda.
  status                        status_venda NOT NULL DEFAULT 'concluida',

  -- [ERP] Observacao livre vinda do ERP. Texto sanitizado na
  -- camada de aplicacao (SanitizeText) antes de persistir.
  observacao                    TEXT,

  -- [SYS] Soft-disable de sync. Venda inativa nao entra em metricas.
  ativo                         BOOLEAN      NOT NULL DEFAULT TRUE,

  -- [SYS] Auditoria minima.
  criado_em                     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em                 TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Lookup por codigo ERP — idempotencia da sincronizacao e
-- resolucao na ingestao. Indice parcial (so linhas com codigo).
CREATE INDEX IF NOT EXISTS idx_vendas_codigo_erp
  ON vendas(codigo_erp)
  WHERE codigo_erp IS NOT NULL;

-- Vendas por cliente — historico de compras de um cliente.
CREATE INDEX IF NOT EXISTS idx_vendas_cliente
  ON vendas(cliente_id)
  WHERE cliente_id IS NOT NULL;

-- Vendas por vendedora — metricas de performance por vendedora.
CREATE INDEX IF NOT EXISTS idx_vendas_vendedora
  ON vendas(vendedora_id)
  WHERE vendedora_id IS NOT NULL;

-- Consulta por periodo/receita — predicado tipico do dashboard
-- (SELECT ... WHERE data_venda BETWEEN ... ). DESC porque o dash
-- olha primeiro o periodo recente.
CREATE INDEX IF NOT EXISTS idx_vendas_data_venda
  ON vendas(data_venda DESC);


-- ------------------------------------------------------------
-- Tabela: itens_venda
--
-- Linhas da venda. CASCADE no delete da venda: apagar a venda
-- apaga seus itens (sao parte integral do agregado). O produto,
-- porem, usa SET NULL: o item sobrevive mesmo se o produto for
-- removido do catalogo, preservando o snapshot historico.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itens_venda (
  id                            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [SYS] Venda dona deste item. CASCADE — item nao existe sem venda.
  venda_id                      UUID         NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,

  -- [ERP/SYS] Produto vendido. SET NULL preserva o item (e seu
  -- snapshot de preco) mesmo se o produto sumir do catalogo.
  produto_id                    UUID         REFERENCES produtos(id) ON DELETE SET NULL,

  -- [ERP] Codigo do item no ERP (linha do pedido). Auxilia
  -- reconciliacao com o Safira.
  codigo_erp_item               VARCHAR(50),

  -- [ERP] Quantidade. DECIMAL(10,4) porque joias podem ser
  -- vendidas por peso/fracao em alguns casos.
  quantidade                    DECIMAL(10,4) NOT NULL DEFAULT 1,

  -- [ERP] SNAPSHOT do preco de venda unitario no momento da venda.
  -- NAO ler de produtos.valor_venda em relatorio — o preco muda.
  valor_unitario                DECIMAL(15,2) NOT NULL,

  -- [ERP] SNAPSHOT do custo unitario (para calculo de margem).
  -- Nullable: nem toda venda traz o custo do ERP.
  valor_custo_unitario          DECIMAL(15,2),

  -- [ERP] Desconto aplicado neste item especifico.
  valor_desconto_item           DECIMAL(15,2) NOT NULL DEFAULT 0,

  -- [ERP] Total da linha (quantidade * unitario - desconto_item).
  -- Validado na camada de aplicacao.
  valor_total_item              DECIMAL(15,2) NOT NULL,

  criado_em                     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em                 TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Itens de uma venda — carregamento do agregado (BuscarVenda).
CREATE INDEX IF NOT EXISTS idx_itens_venda_venda
  ON itens_venda(venda_id);

-- Itens por produto — giro de estoque e produtos mais vendidos.
CREATE INDEX IF NOT EXISTS idx_itens_venda_produto
  ON itens_venda(produto_id)
  WHERE produto_id IS NOT NULL;


-- ------------------------------------------------------------
-- Tabela: pagamentos_venda
--
-- Meios de pagamento da venda. Uma venda pode ter varios (ex:
-- parte no pix, parte no cartao). CASCADE no delete da venda.
--
-- A soma de `valor` desta tabela deve igualar `vendas.valor_total`.
-- Validado na camada de aplicacao (RegistrarVendaUseCase), NAO por
-- constraint — Postgres nao expressa "soma das linhas filhas igual
-- ao pai" sem trigger, e a regra pertence ao dominio.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagamentos_venda (
  id                            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [SYS] Venda dona deste pagamento. CASCADE.
  venda_id                      UUID         NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,

  -- [ERP] Forma de pagamento.
  forma_pagamento               forma_pagamento NOT NULL,

  -- [ERP] Valor pago por este meio.
  valor                         DECIMAL(15,2) NOT NULL,

  -- [ERP] Numero de parcelas (cartao/crediario). >= 1 sempre.
  parcelas                      INT          NOT NULL DEFAULT 1 CHECK (parcelas >= 1),

  -- [ERP] Valor de cada parcela. Nullable (a vista nao parcela).
  valor_parcela                 DECIMAL(15,2),

  -- [ERP] Bandeira do cartao (Visa, Master, Elo). Nullable —
  -- so faz sentido para cartao.
  bandeira                      VARCHAR(30),

  -- [ERP] Data da compensacao/pagamento. Nullable.
  data_pagamento                TIMESTAMPTZ,

  criado_em                     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em                 TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Pagamentos de uma venda — carregamento do agregado (BuscarVenda)
-- e validacao do somatorio na ingestao.
CREATE INDEX IF NOT EXISTS idx_pagamentos_venda_venda
  ON pagamentos_venda(venda_id);
