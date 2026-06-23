import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { AdminUser } from '../../domain/entities/admin-user.entity';
import { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import { RefreshTokenUseCase } from './refresh-token.use-case';

function makeRepoMock(): jest.Mocked<IAdminUserRepository> {
  return {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateRefreshToken: jest.fn(),
  } as unknown as jest.Mocked<IAdminUserRepository>;
}

function makeAdmin(overrides: Partial<AdminUser> = {}): AdminUser {
  const future = new Date(Date.now() + 60_000);
  return new AdminUser(
    'admin-uuid',
    'admin@loja.com',
    'hash',
    null,
    future,
    new Date(),
    ...([] as never[]),
  ) as AdminUser & typeof overrides;
}

describe('RefreshTokenUseCase', () => {
  let useCase: RefreshTokenUseCase;
  let repo: jest.Mocked<IAdminUserRepository>;
  let jwt: jest.Mocked<JwtService>;

  beforeEach(() => {
    repo = makeRepoMock();
    jwt = { sign: jest.fn().mockReturnValue('access-jwt') } as unknown as jest.Mocked<JwtService>;
    useCase = new RefreshTokenUseCase(repo, jwt);
  });

  it('rejeita refresh sem formato {adminId}.{...}', async () => {
    await expect(useCase.execute('')).rejects.toThrow(UnauthorizedException);
  });

  it('rejeita se admin nao existe', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(useCase.execute('inexistente.abc')).rejects.toThrow(UnauthorizedException);
  });

  it('rejeita se admin nao tem refresh_token_hash (logout previo)', async () => {
    const admin = new AdminUser('a', 'e', 'p', null, new Date(Date.now() + 60_000), new Date());
    repo.findById.mockResolvedValue(admin);

    await expect(useCase.execute('a.token')).rejects.toThrow(UnauthorizedException);
  });

  it('invalida a sessao quando hash nao bate (defesa contra token vazado)', async () => {
    const admin = new AdminUser(
      'a',
      'e',
      'p',
      'hash-correto',
      new Date(Date.now() + 60_000),
      new Date(),
    );
    repo.findById.mockResolvedValue(admin);

    await expect(useCase.execute('a.token-errado')).rejects.toThrow(UnauthorizedException);
    expect(repo.updateRefreshToken).toHaveBeenCalledWith('a', null, null);
  });

  it('rejeita e limpa quando refresh expirado', async () => {
    const rawToken = 'a.boa';
    const hash = createHash('sha256').update(rawToken).digest('hex');
    const expirado = new Date(Date.now() - 60_000); // 1 min atras
    const admin = new AdminUser('a', 'e', 'p', hash, expirado, new Date());
    repo.findById.mockResolvedValue(admin);

    await expect(useCase.execute(rawToken)).rejects.toThrow(/expirado/);
    expect(repo.updateRefreshToken).toHaveBeenCalledWith('a', null, null);
  });

  it('rejeita e limpa quando refresh sem expiracao (sessao pre-migration)', async () => {
    const rawToken = 'a.boa';
    const hash = createHash('sha256').update(rawToken).digest('hex');
    const admin = new AdminUser('a', 'e', 'p', hash, null, new Date());
    repo.findById.mockResolvedValue(admin);

    await expect(useCase.execute(rawToken)).rejects.toThrow(/expirado/);
  });

  it('rotaciona o token quando refresh valido', async () => {
    const rawToken = 'a.boa';
    const hash = createHash('sha256').update(rawToken).digest('hex');
    const futuro = new Date(Date.now() + 60_000);
    const admin = new AdminUser('a', 'e', 'p', hash, futuro, new Date());
    repo.findById.mockResolvedValue(admin);

    const result = await useCase.execute(rawToken);

    // Novo refresh token devolvido (diferente do recebido).
    expect(result.refreshToken).not.toBe(rawToken);
    expect(result.refreshToken.startsWith('a.')).toBe(true);

    // Repo recebeu o hash do NOVO token + nova expiracao.
    expect(repo.updateRefreshToken).toHaveBeenCalledTimes(1);
    const [id, newHash, newExpiry] = repo.updateRefreshToken.mock.calls[0];
    expect(id).toBe('a');
    expect(newHash).not.toBe(hash); // hash do novo, nao do velho
    expect(newExpiry).toBeInstanceOf(Date);
    expect(newExpiry!.getTime()).toBeGreaterThan(Date.now());

    // Access token novo emitido.
    expect(result.accessToken).toBe('access-jwt');
    // expiresIn agora vem do default do JwtModule (env JWT_ACCESS_TTL), nao mais
    // por chamada — sign recebe apenas o payload.
    expect(jwt.sign).toHaveBeenCalledWith({ sub: 'a', email: 'e', role: 'ADMIN' });
  });

  it('cada chamada de execute produz token diferente (reuse-resistant)', async () => {
    const raw1 = 'a.token1';
    const hash1 = createHash('sha256').update(raw1).digest('hex');
    const futuro = new Date(Date.now() + 60_000);
    const admin = new AdminUser('a', 'e', 'p', hash1, futuro, new Date());
    repo.findById.mockResolvedValue(admin);

    const r1 = await useCase.execute(raw1);
    const r2 = await useCase.execute(raw1);

    expect(r1.refreshToken).not.toBe(r2.refreshToken);
  });
});
