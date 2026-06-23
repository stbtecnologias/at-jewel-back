import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';

export interface RefreshResult {
  accessToken: string;
  refreshToken: string; // rotacionado — novo a cada uso
}

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly adminUserRepo: IAdminUserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(rawRefreshToken: string): Promise<RefreshResult> {
    const [adminId] = rawRefreshToken.split('.');
    if (!adminId) throw new UnauthorizedException('Refresh token inválido');

    const admin = await this.adminUserRepo.findById(adminId);
    if (!admin || !admin.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const hash = createHash('sha256').update(rawRefreshToken).digest('hex');
    if (hash !== admin.refreshTokenHash) {
      // Hash nao bate. Pode ser: (a) token roubado e expirado pela rotacao,
      // (b) token forjado. Em ambos os casos: invalida a sessao inteira por
      // precaucao — quem tiver o token antigo nao consegue nem o atual.
      await this.adminUserRepo.updateRefreshToken(admin.id, null, null);
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Valida expiracao. Tokens sem `refresh_token_expires_at` (caso de
    // sessoes pre-migration 07) sao tratados como expirados — forca relogin.
    if (
      !admin.refreshTokenExpiresAt ||
      admin.refreshTokenExpiresAt.getTime() <= Date.now()
    ) {
      await this.adminUserRepo.updateRefreshToken(admin.id, null, null);
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Rotacao: gera token novo a cada refresh. Sobrescreve o hash anterior,
    // o que automaticamente invalida o token antigo se vier de outro caller.
    const newRawRefreshToken = `${admin.id}.${randomBytes(32).toString('hex')}`;
    const newHash = createHash('sha256').update(newRawRefreshToken).digest('hex');
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.adminUserRepo.updateRefreshToken(admin.id, newHash, newExpiresAt);

    // expiresIn vem do default do JwtModule (env JWT_ACCESS_TTL).
    const accessToken = this.jwtService.sign({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    });

    return { accessToken, refreshToken: newRawRefreshToken };
  }
}
