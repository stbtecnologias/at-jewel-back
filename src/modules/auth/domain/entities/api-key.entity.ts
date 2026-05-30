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
  ) {}

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
    };
  }
}
