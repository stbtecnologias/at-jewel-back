// Enums do dominio Cliente — espelham os ENUMs do banco (migracao 03 e 06).
// Mantidos como `type` em vez de `enum TS` para evitar import circular e
// gerar JS mais leve. Validacao de valores acontece nos DTOs (class-validator)
// e nos use cases (transicoes de estado).

export type TipoPessoa = 'fisica' | 'juridica';

export type TabelaPreco = 'varejo' | 'atacado' | 'especial' | 'funcionario';

export type TipoCompra = 'pessoal' | 'presente';

export type UrgenciaCompra = 'imediata' | 'proximas_semanas' | 'sem_pressa';

export type NivelConhecimento = 'iniciante' | 'intermediario' | 'conhecedor';

export type OrigemContato =
  | 'whatsapp'
  | 'instagram'
  | 'site'
  | 'indicacao'
  | 'loja_fisica'
  | 'outro';

export type EstadoConversaAgente =
  | 'TRIAGE_IN_PROGRESS'
  | 'READY_FOR_ROUTING'
  | 'WAITING_OWNER_APPROVAL'
  | 'IN_HUMAN_SERVICE'
  | 'NEEDS_HUMAN';

export type MotivacaoCompra = 'uso_proprio' | 'presente' | 'status' | 'investimento';

// Listas iteraveis (uteis em validadores e DTOs)
export const TIPOS_PESSOA: readonly TipoPessoa[] = ['fisica', 'juridica'] as const;
export const TABELAS_PRECO: readonly TabelaPreco[] = [
  'varejo',
  'atacado',
  'especial',
  'funcionario',
] as const;
export const TIPOS_COMPRA: readonly TipoCompra[] = ['pessoal', 'presente'] as const;
export const URGENCIAS: readonly UrgenciaCompra[] = [
  'imediata',
  'proximas_semanas',
  'sem_pressa',
] as const;
export const NIVEIS_CONHECIMENTO: readonly NivelConhecimento[] = [
  'iniciante',
  'intermediario',
  'conhecedor',
] as const;
export const ORIGENS_CONTATO: readonly OrigemContato[] = [
  'whatsapp',
  'instagram',
  'site',
  'indicacao',
  'loja_fisica',
  'outro',
] as const;
export const ESTADOS_CONVERSA: readonly EstadoConversaAgente[] = [
  'TRIAGE_IN_PROGRESS',
  'READY_FOR_ROUTING',
  'WAITING_OWNER_APPROVAL',
  'IN_HUMAN_SERVICE',
  'NEEDS_HUMAN',
] as const;
export const MOTIVACOES_COMPRA: readonly MotivacaoCompra[] = [
  'uso_proprio',
  'presente',
  'status',
  'investimento',
] as const;

// Maquina de estados da conversa da Anastasia.
// Transicoes documentadas em S3 - TABELA CLIENTES.MD secao 13.
export const TRANSICOES_VALIDAS: Readonly<
  Record<EstadoConversaAgente, readonly EstadoConversaAgente[]>
> = {
  TRIAGE_IN_PROGRESS: ['READY_FOR_ROUTING', 'NEEDS_HUMAN'],
  READY_FOR_ROUTING: ['WAITING_OWNER_APPROVAL', 'NEEDS_HUMAN'],
  // Proprietaria pode recusar a sugestao e reabrir o roteamento.
  WAITING_OWNER_APPROVAL: ['IN_HUMAN_SERVICE', 'READY_FOR_ROUTING', 'NEEDS_HUMAN'],
  IN_HUMAN_SERVICE: [], // terminal
  NEEDS_HUMAN: [], // terminal
};

export function transicaoEhValida(
  de: EstadoConversaAgente,
  para: EstadoConversaAgente,
): boolean {
  return TRANSICOES_VALIDAS[de].includes(para);
}
