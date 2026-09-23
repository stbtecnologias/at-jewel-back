// Espelham os enums da migracao 35. Mantidos como union de string (e nao enum
// do TS) pelo mesmo motivo dos demais modulos: o valor que trafega e o texto,
// e a comparacao direta com o que vem do banco fica sem conversao no meio.

/** Para qual acontecimento. NAO confundir com `motivacao_compra`, do perfil. */
export type OcasiaoAtendimento =
  | 'CASAMENTO'
  | 'NOIVADO'
  | 'ANIVERSARIO'
  | 'FORMATURA'
  | 'DATA_COMEMORATIVA'
  | 'AUTOPRESENTE'
  | 'OUTRO';

export const OCASIOES_ATENDIMENTO: readonly OcasiaoAtendimento[] = [
  'CASAMENTO',
  'NOIVADO',
  'ANIVERSARIO',
  'FORMATURA',
  'DATA_COMEMORATIVA',
  'AUTOPRESENTE',
  'OUTRO',
] as const;

/** Como o episodio terminou. Nulo enquanto aberto. */
export type DesfechoAtendimento = 'VENDA' | 'SEM_VENDA' | 'INATIVIDADE';

export type TipoInteracao =
  | 'ENCAMINHADO'
  | 'LEMBRETE'
  | 'COBRANCA'
  | 'RELATO'
  | 'REAGENDAMENTO'
  | 'NOTA'
  // Do WhatsApp corporativo da vendedora (migracao 53). Sao dois e nao um
  // porque a diferenca E o indicativo: cliente que escreve e nao recebe
  // resposta e exatamente o que a gestao precisa enxergar.
  | 'CONTATO_CLIENTE'
  | 'RESPOSTA_VENDEDORA'
  // O inicio do episodio (migracao 64). Carrega o resumo da triagem quando o
  // atendimento nasce dela — e e o ponto de ABERTURA na linha do tempo.
  | 'ABERTURA';

/** Interacoes que EXIGEM `notificarEm` — espelha o CHECK da migracao 35. */
export const TIPOS_AGENDAVEIS: readonly TipoInteracao[] = ['LEMBRETE', 'COBRANCA'] as const;

export type StatusInteracao =
  | 'PENDENTE'
  | 'ENVIADA'
  | 'AGUARDANDO_RESPOSTA'
  | 'CONCLUIDA'
  | 'EXPIRADA';
