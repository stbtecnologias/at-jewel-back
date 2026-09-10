import { ConflictException } from '@nestjs/common';
import { Estoque } from '../../domain/entities/estoque.entity';
import { IEstoqueRepository } from '../../domain/ports/repositories/estoque-repository.port';
import { CriarEstoqueUseCase } from './criar-estoque.use-case';
import { SincronizarEstoqueUseCase } from './sincronizar-estoque.use-case';

function makeRepoMock(): jest.Mocked<IEstoqueRepository> {
  return {
    criar: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorChave: jest.fn(),
    buscarPorIdErp: jest.fn(),
    listar: jest.fn(),
    atualizar: jest.fn(),
    remover: jest.fn(),
    upsert: jest.fn(),
  };
}

const BASE = {
  empresaId: '11111111-1111-1111-1111-111111111111',
  grupoEstoqueId: '22222222-2222-2222-2222-222222222222',
  produtoId: '33333333-3333-3333-3333-333333333333',
  quantidade: 2,
};
const LOCAL = '44444444-4444-4444-4444-444444444444';

// Os testes de "nenhum local" e "mais de um local" sairam com a migracao 57.
// Nao viraram outra coisa: a regra mudou de lugar, e agora quem recusa e o
// `@IsUUID()` do `CriarEstoqueDto` — validacao de DTO, coberta pelo
// ValidationPipe, nao pelo use case.

describe('CriarEstoqueUseCase', () => {
  let repo: jest.Mocked<IEstoqueRepository>;
  let useCase: CriarEstoqueUseCase;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new CriarEstoqueUseCase(repo);
    repo.buscarPorChave.mockResolvedValue(null);
    repo.buscarPorIdErp.mockResolvedValue(null);
    repo.criar.mockImplementation(async (e) => e);
  });

  it('cria com um local', async () => {
    await expect(
      useCase.execute({ ...BASE, localEstoqueId: LOCAL }),
    ).resolves.toBeDefined();
    expect(repo.criar).toHaveBeenCalled();
  });

  // Partida dobrada: a perna negativa e o que a casa deve. A migracao 57 tirou
  // a coluna que dizia A QUEM, mas o negativo segue valido — e barrar aqui
  // quebraria a consignacao de entrada.
  it('aceita quantidade NEGATIVA', async () => {
    const criado = await useCase.execute({
      ...BASE,
      localEstoqueId: LOCAL,
      quantidade: -2,
    });
    expect(criado.quantidade).toBe(-2);
  });

  // A combinacao e UNIQUE no banco: sem esta checagem viria 500 com stack do
  // Postgres, como acontece hoje em produtos.
  it('recusa combinacao ja existente com 409 apontando para o PUT', async () => {
    repo.buscarPorChave.mockResolvedValue(
      Estoque.create({ ...BASE, id: 'uuid-existente', localEstoqueId: LOCAL }),
    );

    await expect(
      useCase.execute({ ...BASE, localEstoqueId: LOCAL }),
    ).rejects.toThrow(ConflictException);
    await expect(
      useCase.execute({ ...BASE, localEstoqueId: LOCAL }),
    ).rejects.toThrow(/PUT \/estoque/);
  });

  it('recusa id do ERP repetido com 409 apontando para o PUT', async () => {
    repo.buscarPorIdErp.mockResolvedValue(
      Estoque.create({ ...BASE, id: 'uuid-existente', localEstoqueId: LOCAL }),
    );

    await expect(
      useCase.execute({ ...BASE, localEstoqueId: LOCAL, idErp: '9001' }),
    ).rejects.toThrow(/PUT \/estoque/);
    expect(repo.criar).not.toHaveBeenCalled();
  });

  // A chave de negocio e a mesma da `uq_estoque_chave`. Se o local deixasse de
  // ser consultado, a checagem casaria com linha de OUTRO armario do mesmo
  // produto e devolveria 409 onde deveria criar.
  it('consulta a chave com as quatro dimensoes, local incluso', async () => {
    await useCase.execute({ ...BASE, localEstoqueId: LOCAL });

    expect(repo.buscarPorChave).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: BASE.empresaId,
        grupoEstoqueId: BASE.grupoEstoqueId,
        produtoId: BASE.produtoId,
        localEstoqueId: LOCAL,
      }),
    );
  });
});

describe('SincronizarEstoqueUseCase', () => {
  let repo: jest.Mocked<IEstoqueRepository>;
  let useCase: SincronizarEstoqueUseCase;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new SincronizarEstoqueUseCase(repo);
    repo.upsert.mockImplementation(async (e) => e);
  });

  // O ERP manda a FOTO do saldo: reenviar a mesma foto e o comportamento
  // normal. Este caminho NAO pode conflitar.
  it('reenviar a mesma chave nao conflita — faz upsert', async () => {
    const entrada = { ...BASE, localEstoqueId: LOCAL, quantidade: 8 };

    await useCase.execute(entrada);
    await useCase.execute(entrada);

    expect(repo.upsert).toHaveBeenCalledTimes(2);
    expect(repo.buscarPorChave).not.toHaveBeenCalled();
  });

  it('leva o local ao upsert', async () => {
    await useCase.execute({ ...BASE, localEstoqueId: LOCAL });

    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ localEstoqueId: LOCAL }),
    );
  });
});
