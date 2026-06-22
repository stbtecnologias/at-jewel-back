import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import { computeRefreshTokenExpiry } from '../refresh-token-expiry';

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

    // Usuario "so Google" (sem senha definida) nao pode logar por senha.
    if (!admin.passwordHash) {
      throw new UnauthorizedException('Use o login com Google para esta conta');
    }

    const passwordMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Credenciais inválidas');

    const accessToken = this.jwtService.sign(
      { sub: admin.id, email: admin.email, role: admin.role },
      { expiresIn: '15m' },
    );

    // Formato: {adminId}.{32 bytes hex} — permite lookup O(1) do admin
    // no refresh sem precisar de coluna adicional.
    const rawRefreshToken = `${admin.id}.${randomBytes(32).toString('hex')}`;
    const refreshTokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    // Janela de inatividade: fim do dia (BR) de hoje+3 dias de calendario (E8).
    const expiresAt = computeRefreshTokenExpiry();

    await this.adminUserRepo.updateRefreshToken(admin.id, refreshTokenHash, expiresAt);

    return { accessToken, refreshToken: rawRefreshToken };
  }
}
