-- ============================================================
-- A.T. JEWEL — Migracao 33: Permissoes de estoque
--
-- A migracao 32 criou `grupos_estoque`, `locais_estoque` e `estoque`, e os
-- tres controllers exigem `estoque:read` / `estoque:write`. Sem esta migracao
-- nenhum papel alcanca as rotas — nem a tela, nem a integracao pelo painel.
--
-- UM PAR PARA AS TRES TABELAS:
--   Quem mexe em estoque precisa das tres juntas. Cadastrar "Armario 01" e um
--   pre-requisito de gravar saldo, nao uma atividade separada. Tres pares de
--   permissao dariam ao operador a chance de ter uma e nao a outra — e o
--   resultado seria uma tela que abre e nao salva.
--
-- QUEM RECEBE E POR QUE:
--   ADMIN        leitura + escrita   administra tudo
--   ESTOQUISTA   leitura + escrita   e o dono operacional do estoque
--   GERENTE      leitura + escrita   acompanha e corrige
--   VENDEDORA    leitura APENAS      precisa saber se a peca esta disponivel
--                                    e onde esta; nao lanca saldo
--
--   VENDEDORA sem escrita e deliberado: saldo errado lancado por engano se
--   propaga silenciosamente, e a correcao depende de comparar com o ERP.
--
-- LEMBRETE PARA QUANDO O DONO FOR DEFINIDO:
--   Se ficar decidido que o ERP e o dono do estoque — provavel, por ser o
--   sistema fiscal —, o CRM nao deveria escrever saldo por tela nenhuma, e
--   `estoque:write` passaria a existir so para a chave de integracao. Neste
--   momento a pergunta esta em aberto com o Alessandro, entao os papeis
--   operacionais recebem escrita para conseguir cadastrar e testar.
--
-- Aditiva/idempotente. Sem DDL — so seed incremental de permissao, no padrao
-- das migracoes 22, 24, 25, 26, 30 e 31.
-- ============================================================

INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',      'estoque:read'),
  ('ADMIN',      'estoque:write'),
  ('ESTOQUISTA', 'estoque:read'),
  ('ESTOQUISTA', 'estoque:write'),
  ('GERENTE',    'estoque:read'),
  ('GERENTE',    'estoque:write'),
  ('VENDEDORA',  'estoque:read')
ON CONFLICT DO NOTHING;
