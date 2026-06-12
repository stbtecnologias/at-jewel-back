// Tipo da meta — define o alvo. POR_PRODUTO/POR_VENDEDORA/POR_CLIENTE usam
// `referenciaId` para apontar o registro alvo; GLOBAL ignora a referencia.
export type TipoMeta = 'GLOBAL' | 'POR_PRODUTO' | 'POR_VENDEDORA' | 'POR_CLIENTE';

export const TIPOS_META: TipoMeta[] = [
  'GLOBAL',
  'POR_PRODUTO',
  'POR_VENDEDORA',
  'POR_CLIENTE',
];
