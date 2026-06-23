// Papel agora e dinamico (tabela `roles`) — string livre. ADMIN_ROLES lista os
// papeis de SISTEMA semeados na migration 21; papeis adicionais podem ser
// criados em runtime.
export type AdminRole = string;

export const ADMIN_ROLES = [
  'SUPERADMIN',
  'ADMIN',
  'GERENTE',
  'VENDEDORA',
  'ESTOQUISTA',
  'MARKETING',
] as const;

export class AdminUser {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly passwordHash: string | null,
    public refreshTokenHash: string | null,
    public refreshTokenExpiresAt: Date | null,
    public readonly createdAt: Date,
    public readonly role: AdminRole = 'ADMIN',
    public readonly nome: string | null = null,
  ) {}
}
