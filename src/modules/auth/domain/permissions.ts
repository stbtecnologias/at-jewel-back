// Catalogo de permissoes granulares (RF-USU-01). Cada chave e um par
// resource:action. Papeis (roles) recebem um subconjunto destas chaves; o
// curinga '*' (apenas SUPERADMIN) concede todas. Fonte unica — exposto a UI
// via GET /auth/roles/catalogo.

export interface PermissaoDef {
  chave: string;
  label: string;
  grupo: string;
}

export const PERMISSOES: PermissaoDef[] = [
  { chave: 'vendas:read', label: 'Ver vendas (próprias, se vendedora)', grupo: 'Vendas' },
  { chave: 'vendas:read_all', label: 'Ver vendas de todas as vendedoras (comparativo)', grupo: 'Vendas' },
  { chave: 'vendas:write', label: 'Editar vendas', grupo: 'Vendas' },
  { chave: 'produtos:read', label: 'Ver produtos', grupo: 'Produtos' },
  { chave: 'produtos:write', label: 'Editar produtos', grupo: 'Produtos' },
  { chave: 'ocorrencias:read', label: 'Ver ocorrências', grupo: 'Produtos' },
  { chave: 'ocorrencias:write', label: 'Registrar ocorrências', grupo: 'Produtos' },
  { chave: 'consignacoes:read', label: 'Ver consignações', grupo: 'Produtos' },
  { chave: 'consignacoes:write', label: 'Registrar consignações', grupo: 'Produtos' },
  { chave: 'fornecedores:read', label: 'Ver fornecedores', grupo: 'Produtos' },
  { chave: 'fornecedores:write', label: 'Editar fornecedores', grupo: 'Produtos' },
  // Um par cobre as tres tabelas do assunto: saldo, grupos e locais.
  { chave: 'estoque:read', label: 'Ver estoque, grupos e locais', grupo: 'Produtos' },
  { chave: 'estoque:write', label: 'Editar estoque, grupos e locais', grupo: 'Produtos' },
  { chave: 'empresas:read', label: 'Ver empresas do grupo', grupo: 'Cadastros' },
  { chave: 'empresas:write', label: 'Editar empresas do grupo', grupo: 'Cadastros' },
  { chave: 'formas_pagamento:read', label: 'Ver formas de pagamento', grupo: 'Cadastros' },
  { chave: 'formas_pagamento:write', label: 'Editar formas de pagamento', grupo: 'Cadastros' },
  { chave: 'demandas:read', label: 'Ver demandas', grupo: 'Demandas' },
  { chave: 'demandas:write', label: 'Abrir demandas', grupo: 'Demandas' },
  { chave: 'demandas:manage', label: 'Responder e gerir demandas', grupo: 'Demandas' },
  { chave: 'clientes:read', label: 'Ver clientes (agregado)', grupo: 'Clientes' },
  { chave: 'clientes:write', label: 'Criar, editar e remover clientes', grupo: 'Clientes' },
  { chave: 'analytics:read', label: 'Ver analytics', grupo: 'Analytics' },
  { chave: 'metas:read', label: 'Ver metas', grupo: 'Metas' },
  { chave: 'metas:write', label: 'Editar metas', grupo: 'Metas' },
  { chave: 'vendedoras:read', label: 'Ver vendedoras', grupo: 'Vendedoras' },
  { chave: 'vendedoras:write', label: 'Editar vendedoras', grupo: 'Vendedoras' },
  { chave: 'agentes:anastasia', label: 'Conversar com a Anastasia', grupo: 'Agentes' },
  { chave: 'agentes:elena', label: 'Conversar com a Elena', grupo: 'Agentes' },
  { chave: 'whatsapp:manage', label: 'Gerenciar WhatsApp', grupo: 'Administração' },
  { chave: 'usuarios:manage', label: 'Gerenciar usuários', grupo: 'Administração' },
  { chave: 'roles:manage', label: 'Gerenciar papéis e permissões', grupo: 'Administração' },
  { chave: 'prompts:manage', label: 'Editar prompts das agentes', grupo: 'Administração' },
  { chave: 'api_keys:manage', label: 'Gerenciar chaves de API', grupo: 'Administração' },
];

export const PERMISSAO_CHAVES: string[] = PERMISSOES.map((p) => p.chave);

/** Curinga: concede todas as permissoes. Apenas o papel SUPERADMIN. */
export const PERMISSAO_TODAS = '*';

/** true se `chave` pertence ao catalogo ou e o curinga. */
export function permissaoValida(chave: string): boolean {
  return chave === PERMISSAO_TODAS || PERMISSAO_CHAVES.includes(chave);
}
