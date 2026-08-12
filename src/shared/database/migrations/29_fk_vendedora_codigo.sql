-- ============================================================
-- A.T. JEWEL — Migracao 29: Fecha as FKs de vendedora por codigo ERP
--
-- Tres colunas apontam para `vendedoras.codigo_erp` e nenhuma tinha
-- constraint. Sao VARCHAR(50) com indice, e nada impede gravar um
-- codigo que nao existe:
--
--   clientes.vendedora_codigo_erp
--   clientes_perfil.vendedora_sugerida_codigo
--   clientes_perfil.vendedora_aprovada_codigo
--
-- POR QUE FICOU ASSIM:
--   A migracao 03 (clientes) declara no comentario da coluna: "FK
--   para vendedoras quando o modulo for implementado". A tabela
--   `vendedoras` so nasceu na migracao 04, depois — e ninguem voltou
--   para fechar o vinculo.
--
-- POR QUE FECHAR AGORA:
--   O ERP Safira vai comecar a enviar vendas, e cada uma traz
--   `vendedora_codigo_erp`. Sem constraint, codigo desconhecido entra
--   calado: o registro grava, o vinculo nao resolve, e a atribuicao
--   de venda se perde SEM ERRO. Descobrir isso depois exige auditar
--   linha a linha. Com a FK, falha na hora e alto.
--
--   Isso importa mais porque, pelo levantado na reuniao, o cadastro
--   de vendedor no ERP tem apenas codigo e nome, e nao ha rota de
--   ingestao de vendedoras no CRM (`POST /erp/vendedoras` nao
--   existe). Ou seja: e provavel que cheguem vendas com codigo de
--   vendedora que ainda nao foi cadastrada aqui.
--
-- ON DELETE SET NULL — alinhado ao padrao do projeto (09_vendas.sql,
-- 24_consignacoes.sql): exclusao/desligamento nao destroi historico,
-- o vinculo cai e o registro fica. Na pratica vendedora nao e
-- apagada, e desativada via `ativo`.
--
-- ON UPDATE CASCADE — se o codigo de uma vendedora mudar no ERP, a
-- mudanca propaga em vez de orfanar as referencias.
--
-- MUDANCA DE COMPORTAMENTO — LER ANTES DE APLICAR:
--   `clientes.vendedora_codigo_erp` nao tem NENHUM escritor no
--   codigo hoje (verificado: so aparece em filtro e leitura). Risco
--   zero.
--
--   As duas colunas de `clientes_perfil` TEM escritor ativo:
--   `atualizar-perfil-cliente.use-case.ts`, via
--   `PATCH /clientes/:id/perfil`, usado pelos agentes com chave de
--   API. Depois desta migracao, codigo de vendedora inexistente
--   deixa de gravar em silencio e passa a estourar violacao de FK —
--   que hoje sobe como 500 generico.
--
--   E o comportamento desejado (falha alta e melhor que corrupcao
--   silenciosa), mas o tratamento amigavel na aplicacao — validar a
--   vendedora antes e responder 400 com mensagem clara — e trabalho
--   pendente da Fase 2. Na pratica o agente obtem os codigos de
--   `/vendedoras/disponiveis`, entao sao validos por construcao.
--
-- PRE-REQUISITO DE APLICACAO:
--   `ALTER TABLE ... ADD CONSTRAINT` FALHA se houver linha orfa.
--   Conferido em 12/08/2026 no banco local: 0 orfaos nas tres
--   colunas, e as 8 vendedoras tem codigo_erp preenchido.
--   RODAR A MESMA CONTAGEM EM PRODUCAO ANTES DE APLICAR LA:
--
--     SELECT count(*) FROM clientes c
--      WHERE c.vendedora_codigo_erp IS NOT NULL
--        AND NOT EXISTS (SELECT 1 FROM vendedoras v
--                         WHERE v.codigo_erp = c.vendedora_codigo_erp);
--
--   (repetir para vendedora_sugerida_codigo e vendedora_aprovada_codigo
--    em clientes_perfil)
--
-- A FK aponta para `vendedoras.codigo_erp`, que e UNIQUE desde a
-- migracao 04 — requisito do Postgres para ser alvo de FK. A coluna
-- e nullable, e isso e permitido: NULL na coluna referenciadora
-- simplesmente nao dispara a verificacao.
--
-- Idempotente via bloco DO/EXCEPTION: `ADD CONSTRAINT` nao aceita
-- `IF NOT EXISTS` no Postgres.
-- ============================================================

DO $$ BEGIN
  ALTER TABLE clientes
    ADD CONSTRAINT fk_clientes_vendedora_codigo
    FOREIGN KEY (vendedora_codigo_erp)
    REFERENCES vendedoras(codigo_erp)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE clientes_perfil
    ADD CONSTRAINT fk_perfil_vendedora_sugerida
    FOREIGN KEY (vendedora_sugerida_codigo)
    REFERENCES vendedoras(codigo_erp)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE clientes_perfil
    ADD CONSTRAINT fk_perfil_vendedora_aprovada
    FOREIGN KEY (vendedora_aprovada_codigo)
    REFERENCES vendedoras(codigo_erp)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
