import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '../../../domain/entities/admin-user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

function makeContext(user: { role: AdminRole } | undefined): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('libera quando @Roles nao foi usado', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeContext({ role: 'VENDEDORA' }))).toBe(true);
  });

  it('libera quando @Roles esta vazio', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    expect(guard.canActivate(makeContext({ role: 'VENDEDORA' }))).toBe(true);
  });

  it('libera quando role do user esta na lista', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'GERENTE'] as AdminRole[]);
    expect(guard.canActivate(makeContext({ role: 'GERENTE' }))).toBe(true);
  });

  it('proibe quando role nao esta na lista', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN'] as AdminRole[]);
    expect(() => guard.canActivate(makeContext({ role: 'VENDEDORA' }))).toThrow(
      ForbiddenException,
    );
  });

  it('proibe quando nao ha user na request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN'] as AdminRole[]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('cobre handler + class (ROLES_KEY)', () => {
    const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    guard.canActivate(makeContext({ role: 'ADMIN' }));
    expect(spy).toHaveBeenCalledWith(ROLES_KEY, expect.arrayContaining([expect.anything()]));
  });
});
