-- ============================================================
-- A.T. JEWEL — Migracao 34: `id_erp` nos cadastros sincronizados
--
-- POR QUE: ate aqui a sincronizacao com o Safira usava `codigo_erp` como
-- chave de idempotencia. Em 18/08/2026 o Lucas apurou que o ERP tem DOIS
-- identificadores por registro, com naturezas diferentes:
--
--   id_erp      a chave da tabela LA. Tecnica, imutavel.
--   codigo_erp  o codigo que a LOJA escolhe. De negocio, e pode ser trocado.
--
-- Chave de sincronizacao precisa ser imutavel. Com `codigo_erp`, bastava
-- alguem renomear no Safira para o upsert nao achar mais o registro antigo e
-- CRIAR UM SEGUNDO — o primeiro virava orfao, com o agravante de que ninguem
-- perceberia: os dois continuariam sendo atualizados como se fossem coisas
-- diferentes.
--
-- Depois desta migracao os papeis ficam separados:
--   `id_erp`     identidade — e por ele que a integracao encontra o registro
--   `codigo_erp` atributo   — exibir, buscar, conferir com o Alessandro
--
-- ADITIVA E NULLABLE, de proposito. Os registros que ja existem em producao
-- (2.505 produtos, clientes, vendas) ficam com `id_erp` nulo ate a proxima
-- sincronizacao preencher. Nada quebra, nada precisa de backfill imediato, e
-- `codigo_erp` continua funcionando enquanto isso.
--
-- UNIQUE em cada uma: dois registros nossos nao podem apontar para a mesma
-- linha do ERP. Como e nullable, o Postgres permite N linhas com NULL — que e
-- exatamente o necessario durante a transicao.
--
-- As tres tabelas de estoque (estoque, grupos_estoque, locais_estoque) NAO
-- aparecem aqui: nasceram com a coluna na migracao 32, que ainda nao tinha
-- ido para producao quando isto foi decidido.
--
-- Sem CREATE TYPE — integralmente re-executavel. Aditiva/idempotente.
-- ============================================================

ALTER TABLE empresas          ADD COLUMN IF NOT EXISTS id_erp VARCHAR(50);
ALTER TABLE produtos          ADD COLUMN IF NOT EXISTS id_erp VARCHAR(50);
ALTER TABLE clientes          ADD COLUMN IF NOT EXISTS id_erp VARCHAR(50);
ALTER TABLE vendedoras        ADD COLUMN IF NOT EXISTS id_erp VARCHAR(50);
ALTER TABLE fornecedores      ADD COLUMN IF NOT EXISTS id_erp VARCHAR(50);
ALTER TABLE formas_pagamento  ADD COLUMN IF NOT EXISTS id_erp VARCHAR(50);
ALTER TABLE vendas            ADD COLUMN IF NOT EXISTS id_erp VARCHAR(50);

-- Itens de venda: segue o padrao local da tabela, que ja tem
-- `codigo_erp_item` (migracao 09) em vez de `codigo_erp`.
ALTER TABLE itens_venda       ADD COLUMN IF NOT EXISTS id_erp_item VARCHAR(50);

-- UNIQUE via indice, e nao via ADD CONSTRAINT: `CREATE UNIQUE INDEX IF NOT
-- EXISTS` e idempotente, enquanto `ADD CONSTRAINT` estoura se ja existir.
CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_id_erp         ON empresas (id_erp);
CREATE UNIQUE INDEX IF NOT EXISTS uq_produtos_id_erp         ON produtos (id_erp);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_id_erp         ON clientes (id_erp);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendedoras_id_erp       ON vendedoras (id_erp);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fornecedores_id_erp     ON fornecedores (id_erp);
CREATE UNIQUE INDEX IF NOT EXISTS uq_formas_pagamento_id_erp ON formas_pagamento (id_erp);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_id_erp           ON vendas (id_erp);
CREATE UNIQUE INDEX IF NOT EXISTS uq_itens_venda_id_erp_item ON itens_venda (id_erp_item);
