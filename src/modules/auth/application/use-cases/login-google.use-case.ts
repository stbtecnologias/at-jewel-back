import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import {
  ADMIN_USER_REPOSITORY,
  GOOGLE_TOKEN_VERIFIER,
} from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import type { IGoogleTokenVerifier } from '../../domain/ports/google-token-verifier.port';
import type { LoginResult } from './login-admin.use-case';
import { computeRefreshTokenExpiry } from '../refresh-token-expiry';

@Injectable()
export class LoginGoogleUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly adminUserRepo: IAdminUserRepository,
    @Inject(GOOGLE_TOKEN_VERIFIER)
    private readonly googleVerifier: IGoogleTokenVerifier,
    private readonly jwtService: JwtService,
  ) {}

  async execute(idToken: string): Promise<LoginResult> {
    const identidade = await this.googleVerifier.verify(idToken);

    if (!identidade.emailVerified) {
      throw new UnauthorizedException('E-mail do Google não verificado');
    }

    // So entram contas JA cadastradas como admin (nao criamos admin
    // automaticamente a partir do Google — controle de acesso explicito).
    const admin = await this.adminUserRepo.findByEmail(identidade.email);
    if (!admin) {
      throw new UnauthorizedException('Conta não autorizada para este painel');
    }

    const accessToken = this.jwtService.sign(
      { sub: admin.id, email: admin.email, role: admin.role },
      { expiresIn: '15m' },
    );

    const rawRefreshToken = `${admin.id}.${randomBytes(32).toString('hex')}`;
    const refreshTokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    // Janela de inatividade: fim do dia (BR) de hoje+3 dias de calendario (E8).
    const expiresAt = computeRefreshTokenExpiry();

    await this.adminUserRepo.updateRefreshToken(admin.id, refreshTokenHash, expiresAt);

    return { accessToken, refreshToken: rawRefreshToken };
  }
}
