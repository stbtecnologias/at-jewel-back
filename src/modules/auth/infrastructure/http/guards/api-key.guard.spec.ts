import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKey } from '../../../domain/entities/api-key.entity';
import { ValidarApiKeyUseCase } from '../../../application/use-cases/validar-api-key.use-case';
import { ApiKeyGuard } from './api-key.guard';

function makeContext(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

function makeApiKey(expiresAt: Date | null): ApiKey {
  return new ApiKey(
    'id-1',
    'n8n',
    'sk_live_abc',
    'hash',
    { scopes: [] },
    true,
    null,
    'admin-1',
    new Date('2026-01-01T00:00:00Z'),
    null,
    expiresAt,
  );
}

describe('ApiKeyGuard', () => {
  let validar: jest.Mocked<ValidarApiKeyUseCase>;
  let guard: ApiKeyGuard;

  beforeEach(() => {
    validar = { execute: jest.fn() } as unknown as jest.Mocked<ValidarApiKeyUseCase>;
    guard = new ApiKeyGuard(validar);
  });

  it('rejeita quando o header x-api-key esta ausente', async () => {
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(validar.execute).not.toHaveBeenCalled();
  });

  it('rejeita quando a chave e invalida/revogada', async () => {
    validar.execute.mockResolvedValue(null);
    await expect(
      guard.canActivate(makeContext({ 'x-api-key': 'sk_live_x' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('aceita chave valida SEM expiracao (expiresAt null)', async () => {
    validar.execute.mockResolvedValue(makeApiKey(null));
    await expect(
      guard.canActivate(makeContext({ 'x-api-key': 'sk_live_x' })),
    ).resolves.toBe(true);
  });

  it('aceita chave valida com expiracao no FUTURO', async () => {
    const futuro = new Date(Date.now() + 60_000);
    validar.execute.mockResolvedValue(makeApiKey(futuro));
    await expect(
      guard.canActivate(makeContext({ 'x-api-key': 'sk_live_x' })),
    ).resolves.toBe(true);
  });

  it('rejeita (401) chave EXPIRADA', async () => {
    const passado = new Date(Date.now() - 60_000);
    validar.execute.mockResolvedValue(makeApiKey(passado));
    await expect(
      guard.canActivate(makeContext({ 'x-api-key': 'sk_live_x' })),
    ).rejects.toThrow(UnauthorizedException);
  });
});
