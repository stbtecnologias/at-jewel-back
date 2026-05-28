import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class LoginAdminUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly adminUserRepo: IAdminUserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(email: string, password: string): Promise<LoginResult> {
    const admin = await this.adminUserRepo.findByEmail(email);
    if (!admin) throw new UnauthorizedException('Credenciais inválidas');

    const passwordMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Credenciais inválidas');

    const accessToken = this.jwtService.sign(
      { sub: admin.id, email: admin.email },
      { expiresIn: '15m' },
    );

    // Format: {adminId}.{32 random bytes hex} — allows O(1) lookup on refresh
    const rawRefreshToken = `${admin.id}.${randomBytes(32).toString('hex')}`;
    const refreshTokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

    await this.adminUserRepo.updateRefreshToken(admin.id, refreshTokenHash);

    return { accessToken, refreshToken: rawRefreshToken };
  }
}
