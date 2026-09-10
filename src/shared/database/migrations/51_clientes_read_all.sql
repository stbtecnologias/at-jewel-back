-- ============================================================
-- A.T. JEWEL — Migracao 51: recorte de clientes por vendedora
--
-- MEL-23 do Documento de Melhorias. Ate aqui `GET /clientes` tinha
-- `@Permissions('clientes:read')` e MAIS NADA — nenhum recorte por
-- vendedora, e nenhum servico de escopo como o que vendas tem.
--
-- O QUE PROTEGIA ERA UM ACIDENTE: a VENDEDORA simplesmente nao
-- possuia a permissao. Bastava alguem marcar a caixinha na tela de
-- Papeis — que existe, esta pronta e e o proprio MEL-22 — para
-- entregar a base inteira de clientes, com telefone, e-mail e
-- limite de credito de todo mundo.
--
-- Fazer o MEL-22 sem o MEL-23 era abrir o buraco de proposito.
--
-- A SOLUCAO E A MESMA JA USADA EM VENDAS: uma permissao separada
-- para "ver tudo". Quem tem `clientes:read_all` ve a carteira
-- inteira; quem tem so `clientes:read` ve os clientes da vendedora
-- a que a conta esta vinculada.
--
-- NINGUEM PERDE ACESSO HOJE. ADMIN e GERENTE sao os unicos com
-- `clientes:read`, e os dois recebem `clientes:read_all` aqui — o
-- comportamento deles nao muda em nada. O que muda e o FUTURO:
-- marcar `clientes:read` para VENDEDORA passou a ser seguro.
--
-- SUPERADMIN nao aparece: ele tem o curinga '*'.
--
-- Origem: [SYS] — permissao. Sem PII.
-- ============================================================

INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',   'clientes:read_all'),
  ('GERENTE', 'clientes:read_all')
ON CONFLICT DO NOTHING;
