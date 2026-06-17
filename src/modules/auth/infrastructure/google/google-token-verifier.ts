import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type {
  GoogleIdentity,
  IGoogleTokenVerifier,
} from '../../domain/ports/google-token-verifier.port';

/**
 * Valida ID tokens (OIDC) do Google usando a google-auth-library, que verifica
 * assinatura (JWKS do Google), emissor, expiracao e audience (GOOGLE_CLIENT_ID).
 * O login Google so funciona se GOOGLE_CLIENT_ID estiver configurado.
 */
@Injectable()
export class GoogleTokenVerifier implements IGoogleTokenVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new ServiceUnavailableException('Login com Google não está configurado');
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token do Google inválido');
    }

    if (!payload?.email) {
      throw new UnauthorizedException('Token do Google sem e-mail');
    }

    return {
      email: payload.email.toLowerCase().trim(),
      emailVerified: payload.email_verified === true,
      nome: payload.name ?? null,
    };
  }
}
