// Como a demanda nasceu:
//  MANUAL     — usuaria registrou pela tela de demandas
//  ASSISTENTE — a Anastasia registrou durante uma conversa (RF-24)
export type CanalDemanda = 'ASSISTENTE' | 'MANUAL';

export const CANAIS_DEMANDA: CanalDemanda[] = ['ASSISTENTE', 'MANUAL'];

// Natureza da solicitacao:
//  RELATORIO — pedido de um relatorio/visao nova
//  AJUSTE    — ajuste/correcao no sistema
//  DUVIDA    — duvida operacional
//  OUTRO     — nao se encaixa nas anteriores
export type TipoDemanda = 'RELATORIO' | 'AJUSTE' | 'DUVIDA' | 'OUTRO';

export const TIPOS_DEMANDA: TipoDemanda[] = ['RELATORIO', 'AJUSTE', 'DUVIDA', 'OUTRO'];

// Situacao do atendimento:
//  ABERTA       — registrada, aguardando triagem da equipe
//  EM_ANDAMENTO — equipe trabalhando
//  CONCLUIDA    — resolvida (carimba concluida_em)
//  CANCELADA    — descartada
export type StatusDemanda = 'ABERTA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';

export const STATUS_DEMANDA: StatusDemanda[] = [
  'ABERTA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'CANCELADA',
];
