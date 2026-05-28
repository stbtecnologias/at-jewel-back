export class AdminUser {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public refreshTokenHash: string | null,
    public readonly createdAt: Date,
  ) {}
}
