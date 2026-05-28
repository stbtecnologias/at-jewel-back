-- ============================================================
-- A.T. JEWEL — Migracao 05: Trilha de Eventos dos Agentes
--
-- Atende RF20 (auditoria), RN12 (governanca) e os requisitos
-- de "Eventos: trilha completa para auditoria e metricas"
-- listados na Definicao de Stacks.
--
-- Cobre tres responsabilidades:
--   1. Auditoria — quem fez o que e quando
--   2. Calculo de SLA pela Sofia (tempos entre eventos)
--   3. Metricas de eficacia (match cliente x vendedora,
--      oportunidades perdidas, tempo de triagem)
--
-- IMPORTANTE — REGRA DE OURO:
-- O campo `payload` JSONB NAO DEVE CONTER PII (telefone, email,
-- conteudo de mensagens, observacoes do cliente). PII fica nas
-- tabelas proprias com cifragem. O payload aqui contem apenas
-- identificadores, metadados operacionais e estados.
--
-- Exemplos validos de payload:
--   { "estado_anterior": "TRIAGE_IN_PROGRESS",
--     "estado_novo": "READY_FOR_ROUTING",
--     "tempo_total_segundos": 245 }
--
--   { "vendedora_sugerida_id": "uuid",
--     "score_match": 0.87,
--     "criterios": ["estilo", "ticket", "afinidade"] }
--
-- Exemplos INVALIDOS (NAO FACA):
--   { "mensagem_cliente": "Quero um anel de noivado..." }  -- PII!
--   { "telefone": "85988887777" }                           -- PII!
-- ============================================================


-- ------------------------------------------------------------
-- ENUM dos agentes que podem emitir eventos.
-- 'sistema' cobre eventos de infra (kill-switch, erros de
-- processamento, jobs agendados) que nao pertencem a um
-- agente de IA especifico.
-- ------------------------------------------------------------
CREATE TYPE nome_agente AS ENUM ('anastasia', 'elena', 'sofia', 'sistema');


-- ------------------------------------------------------------
-- Tabela: agente_eventos
--
-- Append-only. Nunca deve haver UPDATE ou DELETE direto.
-- Volume previsto alto: cada interacao da Anastasia gera
-- multiplos eventos. Por isso a PK e BIGSERIAL (mais barato
-- que UUID em indices) e o IV de uso e timestamp.
--
-- Politica de retencao: a definir (sugestao: 12 meses online,
-- arquivar em storage frio depois). LGPD permite retencao para
-- fins de comprovacao por periodo razoavel.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agente_eventos (
  -- PK numerica sequencial — eficiente para append-only de alto
  -- volume. UUID seria desperdicio aqui.
  id                            BIGSERIAL    PRIMARY KEY,

  -- Qual agente emitiu o evento. Permite filtrar a trilha por
  -- agente sem inspecionar payload.
  agente                        nome_agente  NOT NULL,

  -- Tipo do evento em texto livre (versus ENUM) porque novos
  -- tipos surgem com frequencia conforme os agentes evoluem.
  -- Convencao de nomenclatura: snake_case, sem prefixo de agente.
  --
  -- Tipos previstos (referencia, nao exaustivo):
  --   Anastasia:
  --     triagem_iniciada, pergunta_feita, resposta_recebida,
  --     transcricao_audio, triagem_concluida, vendedora_sugerida,
  --     aprovacao_solicitada, aprovacao_recebida, handoff_realizado,
  --     escalonado_humano, transicao_estado
  --   Elena:
  --     consulta_recebida, consulta_respondida,
  --     catalogo_atualizado, imagem_gerada (V2)
  --   Sofia:
  --     sla_violado_repasse, sla_violado_primeiro_contato,
  --     relatorio_gerado, alerta_emitido
  --   Sistema:
  --     agente_pausado, agente_retomado, erro_processamento,
  --     job_executado
  tipo_evento                   VARCHAR(100) NOT NULL,

  -- Cliente afetado pelo evento (quando aplicavel).
  -- ON DELETE SET NULL e proposital: ao atender pedido de
  -- exclusao LGPD, o cliente vai embora mas os eventos ficam
  -- (anonimizados) para preservar metricas agregadas.
  cliente_id                    UUID         REFERENCES clientes(id) ON DELETE SET NULL,

  -- Vendedora envolvida (quando aplicavel). Mesma regra.
  vendedora_id                  UUID         REFERENCES vendedoras(id) ON DELETE SET NULL,

  -- Agrupador de eventos relacionados a uma mesma "jornada".
  -- Ex: todos os eventos de uma triagem completa compartilham
  -- o mesmo correlation_id. Util para reconstruir o fluxo
  -- end-to-end durante investigacao ou debug.
  correlation_id                UUID,

  -- Dados especificos do evento. JSONB para flexibilidade — mas
  -- ATENCAO a regra de ouro descrita no comentario do arquivo:
  -- NUNCA persistir PII aqui. Apenas IDs, estados, metadados.
  payload                       JSONB,

  -- Qual API key disparou o evento (quando vier via API externa,
  -- como webhooks do n8n). Util para investigar acoes suspeitas
  -- ou identificar quando uma chave esta sendo abusada.
  -- ON DELETE SET NULL: revogar chave nao deve apagar a trilha.
  criado_por_api_key_id         UUID         REFERENCES api_keys(id) ON DELETE SET NULL,

  -- Timestamp do evento. Base de tudo: calculo de SLA, ordenacao
  -- da trilha, queries por janela de tempo.
  criado_em                     TIMESTAMPTZ  NOT NULL DEFAULT now()
);


-- Indice principal de auditoria: investigar tudo o que aconteceu
-- com um cliente especifico ao longo do tempo.
CREATE INDEX IF NOT EXISTS idx_agente_eventos_cliente
  ON agente_eventos(cliente_id, criado_em DESC)
  WHERE cliente_id IS NOT NULL;

-- Indice por correlation_id para reconstruir uma jornada inteira.
CREATE INDEX IF NOT EXISTS idx_agente_eventos_correlation
  ON agente_eventos(correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Indice composto para queries da Sofia (calculo de SLA) e
-- relatorios por tipo de evento.
-- Exemplo: SELECT * FROM agente_eventos
--          WHERE agente = 'anastasia'
--            AND tipo_evento = 'handoff_realizado'
--            AND criado_em > now() - interval '24 hours';
CREATE INDEX IF NOT EXISTS idx_agente_eventos_tipo
  ON agente_eventos(agente, tipo_evento, criado_em DESC);

-- Indice por vendedora — relatorios de atividade por vendedora
-- (handoffs recebidos, tempo medio de primeiro contato).
CREATE INDEX IF NOT EXISTS idx_agente_eventos_vendedora
  ON agente_eventos(vendedora_id, criado_em DESC)
  WHERE vendedora_id IS NOT NULL;

-- Indice geral em criado_em para queries por janela de tempo
-- sem filtro de cliente/vendedora.
CREATE INDEX IF NOT EXISTS idx_agente_eventos_criado_em
  ON agente_eventos(criado_em DESC);
