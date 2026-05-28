import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKey } from '../../../domain/entities/api-key.entity';
import { ScopesGuard } from './scopes.guard';

function makeContext(apiKey: ApiKey | undefined): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ apiKey }),
    }),
  } as unknown as ExecutionContext;
}

function makeApiKey(scopes: unknown): ApiKey {
  return new ApiKey(
    'id',
    'name',
    'sk_live_abcd',
    'hash',
    { scopes },
    true,
    null,
    'admin',
    new Date(),
    null,
  );
}

describe('ScopesGuard', () => {
  let reflector: Reflector;
  let guard: ScopesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new ScopesGuard(reflector);
  });

  it('libera quando @RequireScopes nao foi usado', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeContext(makeApiKey([])))).toBe(true);
  });

  it('libera quando @RequireScopes esta vazio', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    expect(guard.canActivate(makeContext(makeApiKey([])))).toBe(true);
  });

  it('proibe quando nao ha apiKey na request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['clientes:read']);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('libera quando todos os scopes exigidos estao presentes', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['clientes:read', 'clientes:write']);
    expect(
      guard.canActivate(
        makeContext(makeApiKey(['clientes:read', 'clientes:write', 'vendedoras:read'])),
      ),
    ).toBe(true);
  });

  it('proibe quando falta algum scope', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['clientes:read', 'clientes:write']);
    expect(() =>
      guard.canActivate(makeContext(makeApiKey(['clientes:read']))),
    ).toThrow(ForbiddenException);
  });

  it('trata permissions.scopes ausente como vazio', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['clientes:read']);
    const apiKey = new ApiKey(
      'id',
      'name',
      'sk_live_abcd',
      'hash',
      {}, // sem scopes
      true,
      null,
      'admin',
      new Date(),
      null,
    );
    expect(() => guard.canActivate(makeContext(apiKey))).toThrow(ForbiddenException);
  });

  it('ignora valores nao-string dentro de scopes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['clientes:read']);
    const apiKey = makeApiKey(['clientes:read', 123, null, true]);
    expect(guard.canActivate(makeContext(apiKey))).toBe(true);
  });
});
