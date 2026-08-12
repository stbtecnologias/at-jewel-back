import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PermissionsService } from '../../../application/permissions.service';
import { ValidarApiKeyUseCase } from '../../../application/use-cases/validar-api-key.use-case';
import { ApiKey } from '../../../domain/entities/api-key.entity';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { SCOPES_KEY } from '../decorators/scopes.decorator';
import { JwtPayload } from '../strategies/jwt.strategy';

/**
 * Autenticação por JWT de staff (painel admin) OU por API key com scope.
 *
 * - Bearer JWT válido -> checa a PERMISSÃO do papel, popula req.user.
 * - Senão, X-Api-Key válida -> checa os SCOPES da chave, popula req.apiKey.
 * - Nenhuma credencial válida -> 401 (403 se a credencial existe mas não basta).
 *
 * ── Autorização em cada caminho ──────────────────────────────────────────
 *
 * Os dois sistemas de autorização do projeto são separados e continuam
 * separados aqui: papel/permissão vale para humanos (JWT), scope vale para
 * máquinas (chave de API). Este guard escolhe o certo conforme a credencial.
 *
 *   JWT   -> @Permissions(...) se houver; senão, os nomes de @RequireScopes
 *            são usados como permissão. Semântica OU (basta uma), igual ao
 *            PermissionsGuard. Curinga '*' do SUPERADMIN honrado pelo
 *            PermissionsService.
 *   Chave -> @RequireScopes(...), semântica E (todos exigidos).
 *
 * O fallback existe porque as duas listas compartilham nomes de propósito:
 * `produtos:read` é scope e é permissão. Rota que precise divergir declara
 * @Permissions explicitamente.
 *
 * ── Por que mudou ────────────────────────────────────────────────────────
 *
 * A versão anterior fazia `return true` assim que o JWT era válido, sem
 * checar nada — o comentário dizia "staff interno tem acesso pleno". Na
 * prática isso significava que @RequireScopes protegia a chave de API e não
 * protegia ninguém logado: uma usuária com papel VENDEDORA ou MARKETING, que
 * NÃO possui `produtos:write`, conseguia chamar DELETE /produtos/:id — e o
 * remover() do repositório é apagamento físico (repo.delete). Verificado em
 * 12/08/2026, com 2.505 produtos reais em produção.
 *
 * Não era acesso anônimo: exigia conta válida no painel. Era escalada de
 * privilégio entre o staff, com efeito destrutivo e permanente.
 *
 * Efeito colateral esperado desta correção: rota decorada com @RequireScopes
 * cujo nome NÃO exista no catálogo de permissões (src/modules/auth/domain/
 * permissions.ts) passa a recusar todo JWT. Hoje isso não afeta nenhuma rota
 * — as únicas que usam este guard são as de produtos, e `produtos:read` e
 * `produtos:write` existem nos dois catálogos. Ao abrir clientes/vendedoras
 * para chave, conferir o par antes: `clientes:write` e `agente_eventos:write`
 * são scopes SEM permissão equivalente.
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly validarApiKey: ValidarApiKeyUseCase,
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload; apiKey?: ApiKey }>();

    const scopesExigidos = this.reflector.getAllAndOverride<string[] | undefined>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 1. JWT (Bearer) — staff logado no painel.
    const auth = req.headers['authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const token = auth.slice(7).trim();
      let payload: JwtPayload | null = null;
      try {
        payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      } catch {
        // Token inválido/expirado: cai para a tentativa de API key.
      }

      if (payload) {
        req.user = payload;

        // @Permissions explícito manda; senão os scopes valem como permissão.
        const permissoesExigidas =
          this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
          ]) ?? scopesExigidos;

        if (!permissoesExigidas || permissoesExigidas.length === 0) return true;

        const papel = payload.role;
        if (!papel) {
          throw new ForbiddenException('Token sem papel — acesso negado');
        }

        // OU: basta possuir uma das exigidas — mesma semântica do
        // PermissionsGuard, para os dois caminhos se comportarem igual.
        for (const permissao of permissoesExigidas) {
          if (await this.permissions.possui(papel, permissao)) return true;
        }

        throw new ForbiddenException(
          `Papel '${papel}' sem permissão (requer: ${permissoesExigidas.join(' ou ')})`,
        );
      }
    }

    // 2. API key (X-Api-Key) — integrações externas.
    const rawKey = req.headers['x-api-key'];
    if (typeof rawKey === 'string' && rawKey) {
      const apiKey = await this.validarApiKey.execute(rawKey);
      if (!apiKey) {
        throw new UnauthorizedException('API Key inválida ou revogada');
      }
      if (apiKey.isExpired()) {
        throw new UnauthorizedException('API Key expirada');
      }

      // Caminho da máquina: E — todos os scopes exigidos precisam estar na
      // chave. Inalterado; era a única metade que já funcionava.
      if (scopesExigidos && scopesExigidos.length > 0) {
        const scopes = extrairScopes(apiKey);
        const faltando = scopesExigidos.filter((s) => !scopes.includes(s));
        if (faltando.length > 0) {
          throw new ForbiddenException(
            `API Key sem scopes necessarios: ${faltando.join(', ')}`,
          );
        }
      }

      req.apiKey = apiKey;
      return true;
    }

    // 3. Nenhuma credencial.
    throw new UnauthorizedException(
      'Autenticação necessária: envie um Bearer (JWT) ou X-Api-Key',
    );
  }
}

function extrairScopes(apiKey: ApiKey): string[] {
  const raw = apiKey.permissions?.['scopes'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === 'string');
}
