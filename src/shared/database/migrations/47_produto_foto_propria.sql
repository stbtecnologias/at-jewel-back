-- ============================================================
-- A.T. JEWEL — Migracao 47: a foto de produto que e NOSSA
--
-- Ate aqui a unica foto de produto era a do ERP, na coluna
-- `foto_url`. Ela aponta para um servidor de terceiro:
--
--   http://www.conexatecnologia.com/clientes/ATJewel/<codigo_erp>.png
--
-- Isso tem dois furos que esta coluna fecha.
--
-- PRIMEIRO: a cobertura nao e nossa. Em 03/09/2026, 448 das 6.939
-- pecas nao tinham imagem la, e TUDO que entrou de 28/08 em diante
-- veio sem nenhuma. Nao ha como subir uma foto melhor, nem como
-- suprir a que falta.
--
-- SEGUNDO, e o que obriga a COLUNA NOVA em vez de reaproveitar a
-- `foto_url`: o `upsertByCodigoErp` grava o produto inteiro. Quando
-- o Safira sincroniza uma peca sem mandar o campo da foto, ele
-- escreve NULL por cima. Uma foto subida por nos na `foto_url`
-- sobreviveria ate a proxima sincronizacao daquela peca — e sumiria
-- sem aviso.
--
-- Entao ficam duas colunas com donos diferentes:
--
--   foto_url         -> do ERP. Ele escreve, ele apaga, tudo bem.
--   foto_arquivo_id  -> nossa. So o CRM escreve.
--
-- E A PRECEDENCIA E: a nossa ganha. Tendo `foto_arquivo_id`, e ela
-- que aparece; sem ela, cai na do ERP; sem as duas, a peca fica sem
-- imagem, como hoje.
--
-- O QUE A COLUNA GUARDA e uma CHAVE de armazenamento, nunca uma URL
-- — a mesma regra do catalogo:
--
--   produtos/CO26185/9f3c….jpg
--
-- Chave, e nao URL, porque URL absoluta amarraria a linha ao host de
-- hoje: trocar de dominio, de porta ou de disco para S3 exigiria
-- reescrever a base. E a pasta usa o CODIGO, e nao o id interno,
-- porque o codigo e a chave estavel da peca — uma resync que recrie
-- linhas orfanaria tudo que estivesse preso ao id.
--
-- Origem: [SYS] — dado operacional. Sem PII.
-- ============================================================

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS foto_arquivo_id VARCHAR(500);

COMMENT ON COLUMN produtos.foto_arquivo_id IS
  '[SYS] Chave da foto no armazenamento (ex.: produtos/CO26185/uuid.jpg). Nossa, o ERP nao toca. Tem precedencia sobre foto_url.';


-- ------------------------------------------------------------
-- Permissao propria para a foto: `produtos:foto`.
--
-- Separada de `produtos:write` de proposito. Quem fotografa a peca
-- e quem cuida da imagem da marca precisa subir foto; nenhum dos
-- dois precisa mexer em preco, cadastro ou apagar produto — e
-- `produtos:write` da tudo isso junto, inclusive o DELETE, que e
-- apagamento fisico.
--
-- MARKETING e o caso que obriga a separacao: hoje ele tem so
-- `produtos:read` e `catalogo:*`. Sem uma chave propria, dar a ele
-- a foto significaria dar `produtos:write`.
--
-- ESTOQUISTA, GERENTE e ADMIN entram por ja fazerem o trabalho.
-- VENDEDORA fica de fora: ela nem ve esta tela.
-- ------------------------------------------------------------
INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',      'produtos:foto'),
  ('GERENTE',    'produtos:foto'),
  ('MARKETING',  'produtos:foto'),
  ('ESTOQUISTA', 'produtos:foto')
ON CONFLICT DO NOTHING;
