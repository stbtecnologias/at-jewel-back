-- ============================================================
-- A.T. JEWEL — Migracao 21: papeis dinamicos + permissoes granulares
-- (RF-USU-01 / RF-USU-05 / RF-USU-06 / RF-API-01).
--
-- Antes: admin_users.role era um ENUM fixo (ADMIN/GERENTE/VENDEDORA).
-- Agora: papeis viram dados (tabela roles) com matriz de permissoes
-- (role_permissions). admin_users.role passa a varchar referenciando roles.chave.
-- Aditiva/idempotente onde possivel.
-- ============================================================

-- 1. Papeis (chave estavel usada em admin_users.role).
CREATE TABLE IF NOT EXISTS roles (
  chave      varchar(40) PRIMARY KEY,
  nome       varchar(120) NOT NULL,
  descricao  text,
  is_system  boolean NOT NULL DEFAULT false,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

-- 2. Permissoes por papel (chaves resource:action do catalogo; '*' = tudo).
CREATE TABLE IF NOT EXISTS role_permissions (
  role_chave varchar(40) NOT NULL REFERENCES roles(chave) ON DELETE CASCADE,
  permissao  varchar(60) NOT NULL,
  PRIMARY KEY (role_chave, permissao)
);

-- 3. admin_users.role: ENUM perfil_admin -> varchar (permite papeis dinamicos).
ALTER TABLE admin_users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE admin_users ALTER COLUMN role TYPE varchar(40) USING role::text;
ALTER TABLE admin_users ALTER COLUMN role SET DEFAULT 'ADMIN';

-- 4. Papeis de sistema (nao removiveis pela UI).
INSERT INTO roles (chave, nome, descricao, is_system) VALUES
  ('SUPERADMIN', 'Superadmin', 'Equipe tecnica STB — acesso total', true),
  ('ADMIN',      'Administrador', 'Proprietarias — acesso completo', true),
  ('GERENTE',    'Gerente', 'Mesmo acesso das proprietarias (sem chaves de API)', true),
  ('VENDEDORA',  'Vendedora', 'Acesso as proprias informacoes', true),
  ('ESTOQUISTA', 'Estoquista', 'Inventario e reposicao de estoque', true),
  ('MARKETING',  'Marketing', 'Acesso limitado (catalogo)', true)
ON CONFLICT (chave) DO NOTHING;

-- 5. Matriz de permissoes (seed).
INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('SUPERADMIN', '*'),
  -- ADMIN (donas): negocio completo + gestao + chaves de API
  ('ADMIN','vendas:read'),('ADMIN','vendas:write'),
  ('ADMIN','produtos:read'),('ADMIN','produtos:write'),
  ('ADMIN','clientes:read'),('ADMIN','analytics:read'),
  ('ADMIN','metas:read'),('ADMIN','metas:write'),
  ('ADMIN','ocorrencias:read'),('ADMIN','ocorrencias:write'),
  ('ADMIN','vendedoras:read'),('ADMIN','vendedoras:write'),
  ('ADMIN','agentes:anastasia'),('ADMIN','agentes:elena'),
  ('ADMIN','whatsapp:manage'),('ADMIN','usuarios:manage'),
  ('ADMIN','roles:manage'),('ADMIN','prompts:manage'),('ADMIN','api_keys:manage'),
  -- GERENTE (Faby): igual as donas, porem SEM chaves de API (RF-USU-05 + RF-API-01)
  ('GERENTE','vendas:read'),('GERENTE','vendas:write'),
  ('GERENTE','produtos:read'),('GERENTE','produtos:write'),
  ('GERENTE','clientes:read'),('GERENTE','analytics:read'),
  ('GERENTE','metas:read'),('GERENTE','metas:write'),
  ('GERENTE','ocorrencias:read'),('GERENTE','ocorrencias:write'),
  ('GERENTE','vendedoras:read'),('GERENTE','vendedoras:write'),
  ('GERENTE','agentes:anastasia'),('GERENTE','agentes:elena'),
  ('GERENTE','whatsapp:manage'),('GERENTE','usuarios:manage'),
  ('GERENTE','roles:manage'),('GERENTE','prompts:manage'),
  -- VENDEDORA: proprias vendas + Elena
  ('VENDEDORA','vendas:read'),('VENDEDORA','vendedoras:read'),('VENDEDORA','agentes:elena'),
  -- ESTOQUISTA: catalogo/ocorrencias + Elena
  ('ESTOQUISTA','produtos:read'),('ESTOQUISTA','produtos:write'),
  ('ESTOQUISTA','ocorrencias:read'),('ESTOQUISTA','ocorrencias:write'),('ESTOQUISTA','agentes:elena'),
  -- MARKETING: somente catalogo (sem vendas/clientes/vendedores)
  ('MARKETING','produtos:read')
ON CONFLICT DO NOTHING;

-- 6. Equipe STB vira SUPERADMIN (acesso a chaves de API etc.).
UPDATE admin_users SET role = 'SUPERADMIN'
  WHERE lower(email) LIKE '%@stbtecnologias.com.br'
     OR lower(email) LIKE '%@stbdesenvolvimento%';
