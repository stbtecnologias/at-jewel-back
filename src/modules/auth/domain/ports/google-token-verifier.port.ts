export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  nome: string | null;
}

/**
 * Verifica um ID token (OIDC) emitido pelo Google e devolve a identidade.
 * A implementacao valida assinatura, emissor, expiracao e audience
 * (GOOGLE_CLIENT_ID). Lanca erro se o token for invalido ou o login Google
 * nao estiver configurado.
 */
export interface IGoogleTokenVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
}
