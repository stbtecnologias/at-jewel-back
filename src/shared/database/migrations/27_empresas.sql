-- ============================================================
-- A.T. JEWEL — Migracao 27: Cadastro de Empresas
--
-- Levantado na reuniao STB <> CONEXA de 11/08/2026. Ate aqui nao
-- existia nenhuma nocao de empresa no backend — `grep -ri "empresa"
-- src --include=*.ts` retornava zero linhas.
--
-- O QUE E UMA "EMPRESA" AQUI:
--   O grupo da A.T. Jewel opera N empresas dentro do mesmo sistema,
--   compartilhando o MESMO cadastro de produtos. Nao sao
--   necessariamente filiais: Alessandro descreveu que uma trabalha
--   joias e outra trabalha outro segmento. O mesmo anel pode existir
--   na empresa 1 e na empresa 5, com estoques separados.
--
--   Nao confundir com fornecedor (terceiro externo) nem com cliente.
--   Todas pertencem ao mesmo grupo e ao mesmo universo do ERP.
--
-- PRE-REQUISITO DE:
--   - `estoque` — a tabela acordada tem chave
--     (empresa, grupo de local, local, produto)
--   - `vendas.empresa_id` — na reuniao ficou definido que a venda
--     precisa dizer de qual empresa saiu
--
--   Por isso vem antes das duas. E a primeira peca a existir.
--
-- MINIMA DE PROPOSITO:
--   Alessandro foi perguntado se havia algo relevante alem do nome e
--   respondeu que nao. O cadastro nasce com o essencial; acrescentar
--   coluna depois e um ALTER aditivo. Inventar campo que o ERP nao
--   envia cria coluna morta.
--
-- Sem CREATE TYPE — integralmente re-executavel.
-- Aditiva/idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS empresas (
  -- [SYS] Identificador interno, desacoplado do ERP.
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [ERP] Codigo da empresa no ERP Safira. Chave de idempotencia da
  -- sincronizacao e alvo do relacionamento vindo de estoque e vendas.
  -- Nullable: empresa cadastrada manualmente nao tem codigo.
  codigo_erp     VARCHAR(50)  UNIQUE,

  -- [ERP] Nome da empresa. Alessandro enviara a tabela; ate la o
  -- cadastro pode ser preenchido manualmente.
  nome           VARCHAR(255) NOT NULL,

  -- [SYS] Desligamento suave. Empresa inativa some das selecoes, mas
  -- o estoque e as vendas historicas dela continuam consultaveis.
  ativo          BOOLEAN      NOT NULL DEFAULT TRUE,

  -- [SYS] Auditoria minima.
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Lookup por codigo ERP — idempotencia da sincronizacao e resolucao
-- do vinculo na ingestao de estoque e de vendas.
CREATE INDEX IF NOT EXISTS idx_empresas_codigo_erp
  ON empresas(codigo_erp)
  WHERE codigo_erp IS NOT NULL;


-- ------------------------------------------------------------
-- Permissoes granulares (RF-USU-01). SUPERADMIN ja possui '*'.
--
--   empresas:read  -> gestao, estoque e vendedora. Leitura ampla
--                     porque toda tela de estoque e de venda vai
--                     precisar exibir e filtrar por empresa.
--   empresas:write -> gestao. Cadastro estrutural, muda pouco.
-- ------------------------------------------------------------
INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',      'empresas:read'), ('ADMIN',   'empresas:write'),
  ('GERENTE',    'empresas:read'), ('GERENTE', 'empresas:write'),
  ('ESTOQUISTA', 'empresas:read'),
  ('VENDEDORA',  'empresas:read')
ON CONFLICT DO NOTHING;
