import { ListarApiKeysUseCase } from './listar-api-keys.use-case';
import type { IApiKeyRepository } from '../../domain/ports/repositories/api-key-repository.port';
import { ApiKey } from '../../domain/entities/api-key.entity';

function makeApiKey(permissions: Record<string, unknown>): ApiKey {
  return new ApiKey(
    'id-1',
    'n8n',
    'sk_live_abcd',
    'hash-cru-perigoso',
    permissions,
    true,
    null,
    'admin-1',
    new Date(),
    null,
  );
}

describe('ListarApiKeysUseCase', () => {
  it('mapeia para o shape publico e omite keyHash', async () => {
    const repo: jest.Mocked<IApiKeyRepository> = {
      findByHash: jest.fn(),
      findAll: jest.fn().mockResolvedValue([makeApiKey({ scopes: ['clientes:read'] })]),
      findById: jest.fn(),
      create: jest.fn(),
      revoke: jest.fn(),
      updateLastUsed: jest.fn(),
    };

    const useCase = new ListarApiKeysUseCase(repo);
    const result = await useCase.execute();

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('keyHash');
    expect(result[0]).not.toHaveProperty('createdById');
    expect(result[0].scopes).toEqual(['clientes:read']);
  });

  it('retorna scopes vazio quando permissions nao tem scopes', async () => {
    const repo: jest.Mocked<IApiKeyRepository> = {
      findByHash: jest.fn(),
      findAll: jest.fn().mockResolvedValue([makeApiKey({})]),
      findById: jest.fn(),
      create: jest.fn(),
      revoke: jest.fn(),
      updateLastUsed: jest.fn(),
    };

    const useCase = new ListarApiKeysUseCase(repo);
    const result = await useCase.execute();

    expect(result[0].scopes).toEqual([]);
  });
});
