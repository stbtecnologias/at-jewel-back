export type TipoVendedora = 'LOCAL' | 'EXTERNA' | 'GERENTE';

export type StatusDisponibilidadeVendedora =
  | 'DISPONIVEL'
  | 'OCUPADA'
  | 'AUSENTE'
  | 'FERIAS';

export const TIPOS_VENDEDORA: readonly TipoVendedora[] = [
  'LOCAL',
  'EXTERNA',
  'GERENTE',
] as const;

export const STATUS_DISPONIBILIDADE: readonly StatusDisponibilidadeVendedora[] = [
  'DISPONIVEL',
  'OCUPADA',
  'AUSENTE',
  'FERIAS',
] as const;
