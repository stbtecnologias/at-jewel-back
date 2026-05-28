import { Cliente } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { ListarClientesUseCase } from './listar-clientes.use-case';

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

describe('ListarClientesUseCase', () => {
  let useCase: ListarClientesUseCase;
  let repo: jest.Mocked<IClienteRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new ListarClientesUseCase(repo);
  });

  it('passa filtros direto para o repository', async () => {
    const clientes = [
      Cliente.create({
        id: 'a',
        nome: 'A',
        tipoPessoa: 'fisica',
        tabelaPreco: 'varejo',
        ativo: true,
      }),
    ];
    repo.listar.mockResolvedValue(clientes);

    const resultado = await useCase.execute({ ativo: true, tabelaPreco: 'varejo' });

    expect(resultado).toBe(clientes);
    expect(repo.listar).toHaveBeenCalledWith({ ativo: true, tabelaPreco: 'varejo' });
  });

  it('aceita filtros vazios', async () => {
    repo.listar.mockResolvedValue([]);

    const resultado = await useCase.execute({});

    expect(resultado).toEqual([]);
    expect(repo.listar).toHaveBeenCalledWith({});
  });
});
