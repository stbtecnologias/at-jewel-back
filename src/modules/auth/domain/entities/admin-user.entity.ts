export type AdminRole = 'ADMIN' | 'GERENTE' | 'VENDEDORA';

export const ADMIN_ROLES: readonly AdminRole[] = ['ADMIN', 'GERENTE', 'VENDEDORA'] as const;

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
