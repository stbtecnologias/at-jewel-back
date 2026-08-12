-- ============================================================
-- A.T. JEWEL — Migracao 30: Permissao `clientes:write`
--
-- `clientes:write` existia como SCOPE de API Key desde o inicio, mas nunca
-- como PERMISSAO de papel. Sao dois catalogos distintos:
--
--   scopes      -> tela API Keys, autorizam MAQUINAS (integracao)
--   permissoes  -> tela Papeis & Permissoes, autorizam PESSOAS (JWT)
--
-- Ate aqui a assimetria nao incomodava, porque as rotas de escrita de cliente
-- (POST /clientes, PATCH /clientes/:id/perfil) eram acessiveis SO por chave —
-- nenhum caminho de JWT passava por elas.
--
-- POR QUE PRECISA AGORA:
--   Ao abrir o CRUD de clientes para chave, as rotas passam a usar o
--   JwtOrApiKeyGuard, que atende os dois caminhos. Nele, quando a rota declara
--   @RequireScopes sem @Permissions explicito, o nome do scope e usado como
--   permissao no caminho do JWT. Sem esta linha, `clientes:write` recusaria
--   TODO usuario logado, porque nenhum papel a possui.
--
--   Mesmo padrao ja em vigor em vendedoras — la `vendedoras:write` ja existia
--   nos dois catalogos, e por isso aquele modulo nao precisou de migracao.
--
-- CONCESSAO:
--   ADMIN e GERENTE. Nao vai para ESTOQUISTA nem VENDEDORA: cadastro de
--   cliente e operacao comercial/administrativa, e a VENDEDORA nao deve poder
--   remover cliente — o DELETE e exclusao fisica e leva junto todo o perfil de
--   triagem por CASCADE.
--
-- O catalogo canonico em codigo fica em src/modules/auth/domain/permissions.ts;
-- sem registrar la, a chave funciona no guard mas nao aparece na tela de
-- Papeis. Alterado no mesmo commit.
--
-- Aditiva/idempotente. Sem DDL — so seed incremental de permissao, no padrao
-- das migracoes 22, 24, 25 e 26.
-- ============================================================

INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',   'clientes:write'),
  ('GERENTE', 'clientes:write')
ON CONFLICT DO NOTHING;
