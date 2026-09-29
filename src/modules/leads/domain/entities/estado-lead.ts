/**
 * O FUNIL DO LEAD — ANA-03, 29/09/2026.
 *
 * ==========================================================================
 * POR QUE ESTE TIPO EXISTE SEPARADO DO `EstadoConversaAgente`.
 *
 * Ate hoje o lead usava os estados da TRIAGEM — `TRIAGE_IN_PROGRESS`,
 * `READY_FOR_ROUTING`, `WAITING_OWNER_APPROVAL`, `IN_HUMAN_SERVICE`,
 * `NEEDS_HUMAN` —, que descrevem ROTEAMENTO e nao venda. A triagem foi
 * desligada em 24/09/2026, e desde entao o lead nasce do leitor de conversas
 * e cai em `TRIAGE_IN_PROGRESS`: um estado que nao quer dizer nada.
 *
 * O enum antigo continua existindo, porque `clientes_perfil.estado_conversa`
 * ainda o usa e significa outra coisa. Separar e o que permite que cada
 * coluna so aceite o que lhe cabe — ver a migracao 69.
 * ==========================================================================
 *
 * A REGUA, E DE ONDE CADA ESTADO VEM:
 *
 *   NOVO            nasceu da primeira mensagem; ninguem respondeu ainda
 *   EM_ATENDIMENTO  a vendedora respondeu  (webhook, `fromMe`)
 *   GANHO           o leitor de conversas julgou VENDA
 *   PERDIDO         o leitor de conversas julgou SEM_VENDA
 *   PARADO          7 dias sem mensagem e sem desfecho (varredura)
 *
 * A TRANSICAO `NOVO -> EM_ATENDIMENTO` E O TEMPO DE PRIMEIRA RESPOSTA
 * (ANA-09). Ela nao precisa de coluna nova: `estado_atualizado_em` ja existe
 * e ja e mantido. Por isso a metrica mais pedida pela gestao sai de graca —
 * desde que ninguem trate a transicao como detalhe de apresentacao.
 */
export type EstadoLead =
  | 'NOVO'
  | 'EM_ATENDIMENTO'
  | 'GANHO'
  | 'PERDIDO'
  | 'PARADO';

export const ESTADOS_LEAD: readonly EstadoLead[] = [
  'NOVO',
  'EM_ATENDIMENTO',
  'GANHO',
  'PERDIDO',
  'PARADO',
] as const;

/**
 * Os que ainda podem virar venda.
 *
 * `PARADO` ESTA AQUI DE PROPOSITO: parado nao e desfecho, e ausencia de
 * desfecho. A cliente que sumiu ha oito dias pode voltar amanha, e quando
 * voltar o lead precisa continuar contando no funil em vez de ter sido
 * arquivado por decurso de prazo.
 */
export const ESTADOS_EM_ABERTO: readonly EstadoLead[] = [
  'NOVO',
  'EM_ATENDIMENTO',
  'PARADO',
] as const;

/** Os que ja acabaram — e que a varredura de PARADO nunca toca. */
export const ESTADOS_FECHADOS: readonly EstadoLead[] = ['GANHO', 'PERDIDO'] as const;

/** Dias sem mensagem ate o lead ser dado como PARADO. Decisao do Lucas, 29/09. */
export const DIAS_ATE_PARADO = 7;

/** Como cada estado aparece para quem le — WhatsApp e painel. */
export const ROTULO_ESTADO_LEAD: Record<EstadoLead, string> = {
  NOVO: 'novo, sem resposta',
  EM_ATENDIMENTO: 'em atendimento',
  GANHO: 'ganho',
  PERDIDO: 'perdido',
  PARADO: 'parado',
};

export function ehEstadoLead(valor: unknown): valor is EstadoLead {
  return typeof valor === 'string' && (ESTADOS_LEAD as readonly string[]).includes(valor);
}
