import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

// Refresh token TTL: 7 dias. Apos isso o usuario precisa logar de novo.
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

    // ======================================================================
    // A CONTA DESLIGADA NAO ENTRA — migracao 77, 09/11/2026.
    //
    // DEPOIS DA SENHA, E NAO ANTES, de proposito. Recusar antes de conferir a
    // senha faria o tempo de resposta diferenciar "conta desativada" de
    // "senha errada" para quem esta chutando — e e a mesma razao de a frase
    // ser a de sempre, "Credenciais invalidas": quem tenta entrar na conta de
    // alguem nao fica sabendo que ela existe e esta so desligada.
    //
    // Quem foi desligado por engano descobre pelo painel, com quem administra.
    // ======================================================================
    if (!admin.ativo) throw new UnauthorizedException('Credenciais inválidas');

    // expiresIn vem do default do JwtModule (env JWT_ACCESS_TTL).
    const accessToken = this.jwtService.sign({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    });

    // Formato: {adminId}.{32 bytes hex} — permite lookup O(1) do admin
    // no refresh sem precisar de coluna adicional.
    const rawRefreshToken = `${admin.id}.${randomBytes(32).toString('hex')}`;
    const refreshTokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.adminUserRepo.updateRefreshToken(admin.id, refreshTokenHash, expiresAt);

    return { accessToken, refreshToken: rawRefreshToken };
  }
}
