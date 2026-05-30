import { createHash } from 'crypto';
import { GerarApiKeyUseCase } from './gerar-api-key.use-case';
import type { IApiKeyRepository } from '../../domain/ports/repositories/api-key-repository.port';
import { ApiKey } from '../../domain/entities/api-key.entity';

function makeRepoMock(): jest.Mocked<IApiKeyRepository> {
  return {
    findByHash: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    revoke: jest.fn(),
    updateLastUsed: jest.fn(),
  };
}

describe('GerarApiKeyUseCase', () => {
  let repo: jest.Mocked<IApiKeyRepository>;
  let useCase: GerarApiKeyUseCase;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new GerarApiKeyUseCase(repo);
  });

  it('gera rawKey com prefixo sk_live_ e 32 bytes hex', async () => {
    repo.create.mockImplementation(async (data) =>
      new ApiKey(
        'id',
        data.name,
        data.keyPrefix,
        data.keyHash,
        data.permissions ?? {},
        true,
        null,
        data.createdById,
        new Date(),
        null,
      ),
    );

    const result = await useCase.execute('n8n', 'admin-1');

    expect(result.rawKey).toMatch(/^sk_live_[a-f0-9]{64}$/);
    expect(result.keyPrefix).toHaveLength(12);
    expect(result.keyPrefix).toBe(result.rawKey.substring(0, 12));
  });

  it('persiste permissions.scopes com a lista recebida', async () => {
    repo.create.mockImplementation(async (data) =>
      new ApiKey(
        'id',
        data.name,
        data.keyPrefix,
        data.keyHash,
        data.permissions ?? {},
        true,
        null,
        data.createdById,
        new Date(),
        null,
      ),
    );

    const result = await useCase.execute('n8n', 'admin-1', [
      'clientes:read',
      'agente_eventos:write',
    ]);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: { scopes: ['clientes:read', 'agente_eventos:write'] },
      }),
    );
    expect(result.scopes).toEqual(['clientes:read', 'agente_eventos:write']);
  });

  it('default de scopes e array vazio quando nao passado', async () => {
    repo.create.mockImplementation(async (data) =>
      new ApiKey(
        'id',
        data.name,
        data.keyPrefix,
        data.keyHash,
        data.permissions ?? {},
        true,
        null,
        data.createdById,
        new Date(),
        null,
      ),
    );

    await useCase.execute('n8n', 'admin-1');

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: { scopes: [] } }),
    );
  });

  it('keyHash gravado bate com sha256(rawKey)', async () => {
    let savedHash = '';
    repo.create.mockImplementation(async (data) => {
      savedHash = data.keyHash;
      return new ApiKey(
        'id',
        data.name,
        data.keyPrefix,
        data.keyHash,
        data.permissions ?? {},
        true,
        null,
        data.createdById,
        new Date(),
        null,
      );
    });

    const result = await useCase.execute('n8n', 'admin-1');

    const expected = createHash('sha256').update(result.rawKey).digest('hex');
    expect(savedHash).toBe(expected);
  });

  it('resultado nao expoe keyHash', async () => {
    repo.create.mockImplementation(async (data) =>
      new ApiKey(
        'id',
        data.name,
        data.keyPrefix,
        data.keyHash,
        data.permissions ?? {},
        true,
        null,
        data.createdById,
        new Date(),
        null,
      ),
    );

    const result = await useCase.execute('n8n', 'admin-1');

    expect(result).not.toHaveProperty('keyHash');
  });
});
