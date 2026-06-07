// Allow-list de scopes que uma API Key pode receber.
// Toda rota com @RequireScopes deve referenciar um destes literais.
// Manter aqui (e nao no controller) garante que DTO de criacao,
// guard e documentacao convergem para a mesma fonte.
export const SCOPES_VALIDOS = [
  'clientes:read',
  'clientes:write',
  'vendedoras:read',
  'vendas:read',
  'vendas:write',
  'agente_eventos:write',
] as const;

export type ApiKeyScope = (typeof SCOPES_VALIDOS)[number];
