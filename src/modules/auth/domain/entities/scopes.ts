// Allow-list de scopes que uma API Key pode receber.
// Toda rota com @RequireScopes deve referenciar um destes literais.
// Manter aqui (e nao no controller) garante que DTO de criacao,
// guard e documentacao convergem para a mesma fonte.
export const SCOPES_VALIDOS = [
  'clientes:read',
  'clientes:write',
  'vendedoras:read',
  'vendedoras:write',
  'vendas:read',
  'vendas:write',
  'produtos:read',
  'produtos:write',
  'fornecedores:read',
  'fornecedores:write',
  'formas_pagamento:read',
  'formas_pagamento:write',
  'empresas:read',
  'empresas:write',
  // Um par cobre as TRES tabelas do assunto (grupos_estoque, locais_estoque e
  // o saldo): quem integra estoque precisa das tres juntas, e separar so
  // aumentaria o numero de scopes a administrar sem separar risco nenhum.
  'estoque:read',
  'estoque:write',
  // Um par cobre `operacoes` e as tres tabelas de `movimentacoes`, pelo mesmo
  // argumento do estoque: quem le a movimentacao precisa da operacao para
  // saber o que ela e. Sao os dois lados do mesmo documento do ERP.
  'movimentacoes:read',
  'movimentacoes:write',
  'agente_eventos:write',
  // A triagem da Anastasia: o `atwpp` nao tem banco, e grava por aqui.
  'leads:read',
  'leads:write',
] as const;

export type ApiKeyScope = (typeof SCOPES_VALIDOS)[number];

/**
 * Descricao de cada scope, exibida ao lado da caixa na tela de API Keys.
 *
 * Vivia no front (`src/lib/auth/scopes.ts`) ate 13/08/2026, junto de uma copia
 * manual da lista acima. A copia saiu de sincronia tres vezes em tres dias —
 * produtos, vendedoras e fornecedores —, e enquanto isso a caixa simplesmente
 * nao aparecia na tela e a chave nao podia ser criada pelo painel. O caso mais
 * caro foi `produtos:read`/`produtos:write`, que ficaram DOIS MESES fora: a
 * chave `integracao-catalogo`, ativa em producao, nao poderia ser recriada se
 * fosse revogada.
 *
 * Agora a lista e as descricoes saem juntas por GET /auth/api-keys/scopes, e o
 * front renderiza o que vier. Mesmo padrao que a tela de Papeis ja usava com
 * GET /auth/roles/catalogo.
 *
 * O texto e voltado a quem GERA a chave: diz o que ela libera e, quando ajuda,
 * quem consome. `PermissoesDef.label` segue a mesma ideia no catalogo de
 * permissoes.
 *
 * `Record<ApiKeyScope, string>` obriga o compilador a cobrar descricao para
 * todo scope novo — a lista e o mapa nao tem como divergir.
 */
export const SCOPE_DESCRICAO: Record<ApiKeyScope, string> = {
  'clientes:read': 'Listar, buscar e consultar clientes (lookup por whatsapp, SLA)',
  'clientes:write': 'Criar, atualizar e remover clientes e perfil',
  'vendedoras:read': 'Listar e buscar vendedoras, disponiveis e sugestao de match',
  'vendedoras:write': 'Criar, atualizar e remover vendedoras (integracao de cadastro)',
  'vendas:read': 'Ler vendas e resumos',
  'vendas:write': 'Registrar vendas (ingestao)',
  'produtos:read': 'Listar e buscar produtos, facetas e alertas de estoque',
  'produtos:write': 'Criar, atualizar e remover produtos (integracao de catalogo)',
  'fornecedores:read': 'Listar e buscar fornecedores',
  'fornecedores:write': 'Criar, atualizar e remover fornecedores (integracao de cadastro)',
  'formas_pagamento:read': 'Listar e buscar formas de pagamento',
  'formas_pagamento:write': 'Criar, atualizar e remover formas de pagamento',
  'empresas:read': 'Listar e buscar empresas do grupo',
  'empresas:write': 'Criar, atualizar e remover empresas do grupo',
  'estoque:read': 'Consultar saldo de estoque, grupos e locais',
  'estoque:write':
    'Sincronizar saldo de estoque e manter grupos e locais (integracao do ERP)',
  'movimentacoes:read':
    'Ler movimentacoes do ERP (vendas, devolucoes) e o cadastro de operacoes',
  'movimentacoes:write':
    'Sincronizar movimentacoes e manter o cadastro de operacoes (integracao do ERP)',
  'agente_eventos:write': 'Registrar eventos da Anastasia/Elena/Sofia',
  'leads:read': 'Ler leads da triagem (fila do admin)',
  'leads:write': 'Registrar e atualizar a triagem do cliente (consumido pelo atwpp)',
};

export interface ScopeDef {
  chave: ApiKeyScope;
  descricao: string;
}

/** Catalogo servido por GET /auth/api-keys/scopes. */
export const SCOPES_CATALOGO: ScopeDef[] = SCOPES_VALIDOS.map((chave) => ({
  chave,
  descricao: SCOPE_DESCRICAO[chave],
}));
