import { NotFoundException } from '@nestjs/common';
import { Cliente } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { BuscarClienteUseCase } from './buscar-cliente.use-case';

function makeRepoMock(): jest.Mocked<IClienteRepository> {
  return {
    criarComPerfil: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    buscarPorTelefone1Hash: jest.fn(),
    buscarPorEmailHash: jest.fn(),
    listar: jest.fn(),
    atualizar: jest.fn(),
  } as unknown as jest.Mocked<IClienteRepository>;
}

describe('BuscarClienteUseCase', () => {
  let useCase: BuscarClienteUseCase;
  let repo: jest.Mocked<IClienteRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new BuscarClienteUseCase(repo);
  });

  it('retorna cliente com perfil carregado', async () => {
    const cliente = Cliente.create({
      id: 'uuid',
      nome: 'Maria',
      tipoPessoa: 'fisica',
      tabelaPreco: 'varejo',
      ativo: true,
    });
    repo.buscarPorId.mockResolvedValue(cliente);

    const resultado = await useCase.execute('uuid');

    expect(resultado).toBe(cliente);
    expect(repo.buscarPorId).toHaveBeenCalledWith('uuid', { incluirPerfil: true });
  });

  it('lanca NotFoundException se cliente nao existe', async () => {
    repo.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(NotFoundException);
  });
});
