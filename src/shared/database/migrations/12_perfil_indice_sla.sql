-- ============================================================
-- A.T. JEWEL — Migracao 12: Indice composto para monitoramento de SLA
--
-- Atende:
--   - Endpoint GET /clientes/monitoramento-sla (agente gerencial Sofia via
--     n8n): lista clientes nos estados de atendimento monitorados
--     (READY_FOR_ROUTING, WAITING_OWNER_APPROVAL, IN_HUMAN_SERVICE),
--     ORDENADOS por estado_atualizado_em ASC (mais antigo primeiro), para
--     comparacao com os SLAs configurados no n8n.
--
-- Por que um indice novo:
--   O indice existente idx_perfil_estado_conversa (migracao 03) cobre apenas
--   estado_conversa. A query de SLA filtra por estado E ordena por
--   estado_atualizado_em. Sem a segunda coluna no indice, o Postgres precisa
--   ordenar em memoria os perfis filtrados. O indice composto abaixo permite
--   um index scan ja ordenado (filtro + ORDER BY servidos pelo mesmo indice),
--   barato mesmo com a fila de atendimento represada.
--
-- Decisao: indice PARCIAL apenas sobre os tres estados monitorados.
--   - Reduz o tamanho do indice (a maioria dos perfis termina em estados
--     terminais / TRIAGE, fora do escopo de SLA).
--   - Casa exatamente com o predicado da query (estado IN (monitorados)).
--
-- Nao altera dados; apenas cria indice. Idempotente (IF NOT EXISTS).
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_perfil_estado_sla
  ON clientes_perfil(estado_conversa, estado_atualizado_em)
  WHERE estado_conversa IN (
    'READY_FOR_ROUTING',
    'WAITING_OWNER_APPROVAL',
    'IN_HUMAN_SERVICE'
  );
