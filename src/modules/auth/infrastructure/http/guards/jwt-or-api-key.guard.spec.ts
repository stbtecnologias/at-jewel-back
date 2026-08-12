import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PermissionsService } from '../../../application/permissions.service';
import { ValidarApiKeyUseCase } from '../../../application/use-cases/validar-api-key.use-case';
import { ApiKey } from '../../../domain/entities/api-key.entity';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { SCOPES_KEY } from '../decorators/scopes.decorator';
import { JwtOrApiKeyGuard } from './jwt-or-api-key.guard';

// Request minima: so os headers importam para o guard, e ele grava
// `user`/`apiKey` nela — por isso o objeto e reaproveitado nas assercoes.
function makeContext(headers: Record<string, string>) {
  const req: Record<string, unknown> = { headers };
  const ctx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

// `expiresAt` e o ULTIMO parametro do construtor (11o), com default null —
// posicionado assim para nao quebrar instanciacoes antigas. Passar a data
// numa posicao anterior a joga em `lastUsedAt` e isExpired() nunca dispara.
function makeApiKey(scopes: string[], opts?: { expiraEm?: Date | null }): ApiKey {
  return new ApiKey(
    'id',
    'name',
    'sk_live_abcd',
    'hash',
    { scopes },
    true,
    null, // lastUsedAt
    'admin',
    new Date(),
    null, // revokedAt
    opts?.expiraEm ?? null,
  );
}

/**
 * Metadata por chave: permite simular @RequireScopes e @Permissions de forma
 * independente, que e exatamente o que o guard le em separado.
 */
function mockReflector(reflector: Reflector, meta: { scopes?: string[]; permissoes?: string[] }) {
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) =>
      key === SCOPES_KEY ? meta.scopes : key === PERMISSIONS_KEY ? meta.permissoes : undefined,
    );
}

describe('JwtOrApiKeyGuard', () => {
  let reflector: Reflector;
  let jwtService: JwtService;
  let validarApiKey: jest.Mocked<ValidarApiKeyUseCase>;
  let permissions: jest.Mocked<PermissionsService>;
  let guard: JwtOrApiKeyGuard;

  beforeEach(() => {
    reflector = new Reflector();
    jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
    validarApiKey = { execute: jest.fn() } as unknown as jest.Mocked<ValidarApiKeyUseCase>;
    permissions = { possui: jest.fn() } as unknown as jest.Mocked<PermissionsService>;
    guard = new JwtOrApiKeyGuard(jwtService, validarApiKey, reflector, permissions);
  });

  // ── Caminho do JWT ──────────────────────────────────────────────────────
  describe('JWT', () => {
    it('libera quando o papel possui a permissao exigida', async () => {
      mockReflector(reflector, { scopes: ['produtos:read'] });
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'u1', role: 'GERENTE' });
      permissions.possui.mockResolvedValue(true);

      const { ctx, req } = makeContext({ authorization: 'Bearer tok' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(permissions.possui).toHaveBeenCalledWith('GERENTE', 'produtos:read');
      expect(req.user).toEqual({ sub: 'u1', role: 'GERENTE' });
    });

    /**
     * REGRESSAO — este e o defeito que a correcao fechou.
     *
     * Antes, o guard fazia `return true` assim que o JWT era valido. Uma
     * usuaria com papel VENDEDORA, que nao possui `produtos:write`, conseguia
     * chamar DELETE /produtos/:id — e o remover() do repositorio e apagamento
     * fisico. Se este teste voltar a passar como `true`, a falha voltou.
     */
    it('PROIBE quando o papel NAO possui a permissao exigida', async () => {
      mockReflector(reflector, { scopes: ['produtos:write'] });
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'u2', role: 'VENDEDORA' });
      permissions.possui.mockResolvedValue(false);

      const { ctx } = makeContext({ authorization: 'Bearer tok' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('libera qualquer JWT valido quando a rota nao exige nada', async () => {
      mockReflector(reflector, {});
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'u3', role: 'MARKETING' });

      const { ctx } = makeContext({ authorization: 'Bearer tok' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(permissions.possui).not.toHaveBeenCalled();
    });

    it('@Permissions explicito tem precedencia sobre os scopes', async () => {
      mockReflector(reflector, { scopes: ['clientes:write'], permissoes: ['clientes:read'] });
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'u4', role: 'GERENTE' });
      permissions.possui.mockResolvedValue(true);

      const { ctx } = makeContext({ authorization: 'Bearer tok' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(permissions.possui).toHaveBeenCalledWith('GERENTE', 'clientes:read');
      expect(permissions.possui).not.toHaveBeenCalledWith('GERENTE', 'clientes:write');
    });

    it('basta possuir UMA das permissoes exigidas (semantica OU)', async () => {
      mockReflector(reflector, { permissoes: ['vendas:read', 'vendas:read_all'] });
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'u5', role: 'VENDEDORA' });
      permissions.possui.mockImplementation((_r, p) => Promise.resolve(p === 'vendas:read_all'));

      const { ctx } = makeContext({ authorization: 'Bearer tok' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('proibe token sem papel', async () => {
      mockReflector(reflector, { scopes: ['produtos:read'] });
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'u6' });

      const { ctx } = makeContext({ authorization: 'Bearer tok' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('JWT invalido cai para a API key em vez de recusar direto', async () => {
      mockReflector(reflector, { scopes: ['produtos:read'] });
      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(new Error('expirado'));
      validarApiKey.execute.mockResolvedValue(makeApiKey(['produtos:read']));

      const { ctx, req } = makeContext({ authorization: 'Bearer velho', 'x-api-key': 'sk_live_x' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.apiKey).toBeDefined();
    });
  });

  // ── Caminho da API key (comportamento preservado) ───────────────────────
  describe('API key', () => {
    it('libera quando a chave tem todos os scopes exigidos', async () => {
      mockReflector(reflector, { scopes: ['produtos:read'] });
      validarApiKey.execute.mockResolvedValue(makeApiKey(['produtos:read', 'produtos:write']));

      const { ctx } = makeContext({ 'x-api-key': 'sk_live_x' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('proibe quando falta um scope (semantica E)', async () => {
      mockReflector(reflector, { scopes: ['produtos:read', 'produtos:write'] });
      validarApiKey.execute.mockResolvedValue(makeApiKey(['produtos:read']));

      const { ctx } = makeContext({ 'x-api-key': 'sk_live_x' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('a chave NAO e submetida a checagem de permissao de papel', async () => {
      mockReflector(reflector, { scopes: ['produtos:read'], permissoes: ['produtos:read'] });
      validarApiKey.execute.mockResolvedValue(makeApiKey(['produtos:read']));

      const { ctx } = makeContext({ 'x-api-key': 'sk_live_x' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(permissions.possui).not.toHaveBeenCalled();
    });

    it('recusa chave invalida ou revogada', async () => {
      mockReflector(reflector, { scopes: ['produtos:read'] });
      validarApiKey.execute.mockResolvedValue(null);

      const { ctx } = makeContext({ 'x-api-key': 'sk_live_x' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('recusa chave expirada', async () => {
      mockReflector(reflector, { scopes: ['produtos:read'] });
      validarApiKey.execute.mockResolvedValue(
        makeApiKey(['produtos:read'], { expiraEm: new Date(Date.now() - 1000) }),
      );

      const { ctx } = makeContext({ 'x-api-key': 'sk_live_x' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  it('recusa quando nao ha credencial nenhuma', async () => {
    mockReflector(reflector, { scopes: ['produtos:read'] });
    const { ctx } = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
