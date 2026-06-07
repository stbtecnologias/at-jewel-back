export type NomeAgente = 'anastasia' | 'elena' | 'sofia' | 'sistema';

export const NOMES_AGENTE: readonly NomeAgente[] = [
  'anastasia',
  'elena',
  'sofia',
  'sistema',
] as const;

// Allowlist de tipos de evento (H-003 da revisao anti-prompt-injection).
// O `tipo_evento` e VARCHAR livre no banco (migracao 05), mas a entrada via
// API precisa ser restrita a uma allowlist: a deteccao de ataque da Sofia
// depende de eventos `suspeita_injection`, e um tipo livre poderia ser
// mascarado/poluido para escapar das metricas. Fonte: tipos previstos na
// migracao 05_agente_eventos.sql e os exigidos pelo hardening (S4).
export type TipoEventoAgente =
  // Anastasia — triagem e roteamento
  | 'triagem_iniciada'
  | 'triagem_atualizada'
  | 'pergunta_feita'
  | 'resposta_recebida'
  | 'transcricao_audio'
  | 'triagem_concluida'
  | 'vendedora_sugerida'
  | 'aprovacao_solicitada'
  | 'aprovacao_recebida'
  | 'handoff_realizado'
  | 'escalonado_humano'
  | 'transicao_estado'
  // Elena — catalogo
  | 'consulta_recebida'
  | 'consulta_respondida'
  | 'catalogo_atualizado'
  | 'imagem_gerada'
  // Sofia — SLA e seguranca
  | 'sla_violado_repasse'
  | 'sla_violado_primeiro_contato'
  | 'relatorio_gerado'
  | 'alerta_emitido'
  | 'suspeita_injection'
  // Sistema — infra
  | 'agente_pausado'
  | 'agente_retomado'
  | 'erro_processamento'
  | 'job_executado';

export const TIPOS_EVENTO_VALIDOS: readonly TipoEventoAgente[] = [
  'triagem_iniciada',
  'triagem_atualizada',
  'pergunta_feita',
  'resposta_recebida',
  'transcricao_audio',
  'triagem_concluida',
  'vendedora_sugerida',
  'aprovacao_solicitada',
  'aprovacao_recebida',
  'handoff_realizado',
  'escalonado_humano',
  'transicao_estado',
  'consulta_recebida',
  'consulta_respondida',
  'catalogo_atualizado',
  'imagem_gerada',
  'sla_violado_repasse',
  'sla_violado_primeiro_contato',
  'relatorio_gerado',
  'alerta_emitido',
  'suspeita_injection',
  'agente_pausado',
  'agente_retomado',
  'erro_processamento',
  'job_executado',
] as const;
