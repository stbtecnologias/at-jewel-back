import { BadRequestException } from '@nestjs/common';
import { Consignacao } from '../../domain/entities/consignacao.entity';
import { IConsignacaoRepository } from '../../domain/ports/repositories/consignacao-repository.port';
import { CriarConsignacaoUseCase } from './criar-consignacao.use-case';

function makeRepoMock(): jest.Mocked<IConsignacaoRepository> {
  return {
    criar: jest.fn(),
    listar: jest.fn(),
    buscarItemPorId: jest.fn(),
    buscarPorId: jest.fn(),
    atualizar: jest.fn(),
    resumo: jest.fn(),
  } as unknown as jest.Mocked<IConsignacaoRepository>;
}

describe('CriarConsignacaoUseCase', () => {
  let useCase: CriarConsignacaoUseCase;
  let repo: jest.Mocked<IConsignacaoRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new CriarConsignacaoUseCase(repo);
  });

  it('cria consignacao para CLIENTE com clienteId valido', async () => {
    repo.criar.mockImplementation(async (c) => c);

    const resultado = await useCase.execute({
      produtoId: 'prod-1',
      quantidade: 2,
      destinoTipo: 'CLIENTE',
      clienteId: 'cli-1',
      criadoPor: 'user-1',
    });

    expect(repo.criar).toHaveBeenCalledTimes(1);
    const arg = repo.criar.mock.calls[0][0] as Consignacao;
    expect(arg.destinoTipo).toBe('CLIENTE');
    expect(arg.clienteId).toBe('cli-1');
    expect(arg.vendedoraId).toBeNull();
    expect(arg.status).toBe('ABERTA');
    expect(arg.criadoPor).toBe('user-1');
    expect(resultado.quantidade).toBe(2);
  });

  it('cria consignacao para VENDEDORA com vendedoraId valido', async () => {
    repo.criar.mockImplementation(async (c) => c);

    await useCase.execute({
      produtoId: 'prod-1',
      quantidade: 1,
      destinoTipo: 'VENDEDORA',
      vendedoraId: 'vend-1',
    });

    const arg = repo.criar.mock.calls[0][0] as Consignacao;
    expect(arg.vendedoraId).toBe('vend-1');
    expect(arg.clienteId).toBeNull();
  });

  it('rejeita destino CLIENTE sem clienteId (400)', async () => {
    await expect(
      useCase.execute({
        produtoId: 'prod-1',
        quantidade: 1,
        destinoTipo: 'CLIENTE',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.criar).not.toHaveBeenCalled();
  });

  it('rejeita destino CLIENTE que tambem envia vendedoraId (400)', async () => {
    await expect(
      useCase.execute({
        produtoId: 'prod-1',
        quantidade: 1,
        destinoTipo: 'CLIENTE',
        clienteId: 'cli-1',
        vendedoraId: 'vend-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.criar).not.toHaveBeenCalled();
  });

  it('rejeita destino VENDEDORA sem vendedoraId (400)', async () => {
    await expect(
      useCase.execute({
        produtoId: 'prod-1',
        quantidade: 1,
        destinoTipo: 'VENDEDORA',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.criar).not.toHaveBeenCalled();
  });

  it('rejeita quantidade zero/negativa (400)', async () => {
    await expect(
      useCase.execute({
        produtoId: 'prod-1',
        quantidade: 0,
        destinoTipo: 'VENDEDORA',
        vendedoraId: 'vend-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
