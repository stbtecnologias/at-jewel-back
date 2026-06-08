import type { ApiKeyScope } from './scopes';

export interface ApiKeyPublic {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

export class ApiKey {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly keyPrefix: string,
    public readonly keyHash: string,
    public readonly permissions: Record<string, unknown>,
    public isActive: boolean,
    public lastUsedAt: Date | null,
    public readonly createdById: string,
    public readonly createdAt: Date,
    public revokedAt: Date | null,
    // M-002: expiracao opcional. NULL/ausente = nao expira (legado).
    // Posicionado por ultimo com default para nao quebrar instanciacoes
    // existentes (specs/use cases) que ainda nao passam expiracao.
    public readonly expiresAt: Date | null = null,
  ) {}

  // M-002: verdadeiro quando a chave tem expiracao definida e ja passou.
  // Chave sem expiracao (expiresAt null) nunca expira.
  isExpired(now: Date = new Date()): boolean {
    return this.expiresAt !== null && this.expiresAt.getTime() <= now.getTime();
  }

  // Shape exposto na API publica — omite keyHash e createdById.
  // keyHash nunca pode vazar (permitiria autenticar como a key).
  toPublic(): ApiKeyPublic {
    const rawScopes = this.permissions?.['scopes'];
    const scopes = Array.isArray(rawScopes)
      ? rawScopes.filter((s): s is ApiKeyScope => typeof s === 'string')
      : [];

    return {
      id: this.id,
      name: this.name,
      keyPrefix: this.keyPrefix,
      scopes,
      isActive: this.isActive,
      lastUsedAt: this.lastUsedAt,
      createdAt: this.createdAt,
      revokedAt: this.revokedAt,
      expiresAt: this.expiresAt,
    };
  }
}
