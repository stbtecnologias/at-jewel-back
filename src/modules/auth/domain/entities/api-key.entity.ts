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
}
