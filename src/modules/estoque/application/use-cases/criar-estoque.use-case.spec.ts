import { BadRequestException, ConflictException } from '@nestjs/common';
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
  } as unknown as jest.Mocked<IEstoqueRepository>;
}

const BASE = {
  empresaId: '11111111-1111-1111-1111-111111111111',
  grupoEstoqueId: '22222222-2222-2222-2222-222222222222',
  produtoId: '33333333-3333-3333-3333-333333333333',
  quantidade: 2,
};
const LOCAL = '44444444-4444-4444-4444-444444444444';
const FORNECEDOR = '55555555-5555-5555-5555-555555555555';

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

  // Partida dobrada: a perna negativa e o que a casa deve ao fornecedor.
  // Barrar isso quebraria a primeira consignacao de entrada.
  it('aceita quantidade NEGATIVA', async () => {
    const criado = await useCase.execute({
      ...BASE,
      fornecedorId: FORNECEDOR,
      quantidade: -2,
    });
    expect(criado.quantidade).toBe(-2);
  });

  it('recusa quando NENHUM local vem', async () => {
    await expect(useCase.execute({ ...BASE })).rejects.toThrow(BadRequestException);
    expect(repo.criar).not.toHaveBeenCalled();
  });

  it('recusa quando vem MAIS DE UM local', async () => {
    await expect(
      useCase.execute({ ...BASE, localEstoqueId: LOCAL, fornecedorId: FORNECEDOR }),
    ).rejects.toThrow(BadRequestException);
    expect(repo.criar).not.toHaveBeenCalled();
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

  it('mantem a validacao de local', async () => {
    await expect(useCase.execute({ ...BASE })).rejects.toThrow(BadRequestException);
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});
