import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginGoogleUseCase } from './login-google.use-case';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import type { IGoogleTokenVerifier } from '../../domain/ports/google-token-verifier.port';

describe('LoginGoogleUseCase', () => {
  const admin = {
    id: 'a1',
    email: 'dona@atjewel.com',
    role: 'ADMIN' as const,
    passwordHash: 'x',
    nome: 'Dona',
  };

  function montar(overrides?: {
    verify?: IGoogleTokenVerifier['verify'];
    findByEmail?: IAdminUserRepository['findByEmail'];
  }) {
    const repo: Partial<IAdminUserRepository> = {
      findByEmail: overrides?.findByEmail ?? jest.fn().mockResolvedValue(admin),
      updateRefreshToken: jest.fn().mockResolvedValue(undefined),
    };
    const verifier: IGoogleTokenVerifier = {
      verify:
        overrides?.verify ??
        jest.fn().mockResolvedValue({ email: 'dona@atjewel.com', emailVerified: true, nome: 'Dona' }),
    };
    const jwt = new JwtService({ secret: 'test-secret' });
    const uc = new LoginGoogleUseCase(
      repo as IAdminUserRepository,
      verifier,
      jwt,
    );
    return { uc, repo, verifier, jwt };
  }

  it('emite accessToken e refreshToken para admin existente', async () => {
    const { uc, repo } = montar();
    const out = await uc.execute('id-token');
    expect(out.accessToken).toEqual(expect.any(String));
    expect(out.refreshToken).toContain('a1.');
    expect(repo.updateRefreshToken).toHaveBeenCalledWith('a1', expect.any(String), expect.any(Date));
  });

  it('rejeita e-mail nao verificado', async () => {
    const { uc } = montar({
      verify: jest.fn().mockResolvedValue({ email: 'x@y.com', emailVerified: false, nome: null }),
    });
    await expect(uc.execute('t')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita conta nao cadastrada como admin', async () => {
    const { uc } = montar({ findByEmail: jest.fn().mockResolvedValue(null) });
    await expect(uc.execute('t')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
