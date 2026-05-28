import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly adminUserRepo: IAdminUserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(rawRefreshToken: string): Promise<{ accessToken: string }> {
    const [adminId] = rawRefreshToken.split('.');
    if (!adminId) throw new UnauthorizedException('Refresh token inválido');

    const admin = await this.adminUserRepo.findById(adminId);
    if (!admin || !admin.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const hash = createHash('sha256').update(rawRefreshToken).digest('hex');
    if (hash !== admin.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const accessToken = this.jwtService.sign(
      { sub: admin.id, email: admin.email },
      { expiresIn: '15m' },
    );

    return { accessToken };
  }
}
