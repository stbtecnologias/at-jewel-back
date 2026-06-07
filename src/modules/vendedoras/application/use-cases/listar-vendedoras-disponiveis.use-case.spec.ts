import { Vendedora } from '../../domain/entities/vendedora.entity';
import { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';
import { ListarVendedorasDisponiveisUseCase } from './listar-vendedoras-disponiveis.use-case';

function makeRepoMock(): jest.Mocked<IVendedoraRepository> {
  return {
    criar: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    buscarPorEmailHash: jest.fn(),
    buscarPorWhatsappHash: jest.fn(),
    listar: jest.fn(),
    atualizar: jest.fn(),
  } as unknown as jest.Mocked<IVendedoraRepository>;
}

describe('ListarVendedorasDisponiveisUseCase', () => {
  let useCase: ListarVendedorasDisponiveisUseCase;
  let repo: jest.Mocked<IVendedoraRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new ListarVendedorasDisponiveisUseCase(repo);
  });

  it('aplica filtro fixo ativo=true e statusDisponibilidade=DISPONIVEL', async () => {
    repo.listar.mockResolvedValue([]);

    await useCase.execute();

    expect(repo.listar).toHaveBeenCalledTimes(1);
    expect(repo.listar).toHaveBeenCalledWith({
      ativo: true,
      statusDisponibilidade: 'DISPONIVEL',
    });
  });

  it('repassa a lista retornada pelo repositorio', async () => {
    const vendedora = Vendedora.create({
      nome: 'Maria',
      tipo: 'LOCAL',
      ativo: true,
      statusDisponibilidade: 'DISPONIVEL',
      especialidades: ['noivado'],
    });
    repo.listar.mockResolvedValue([vendedora]);

    const resultado = await useCase.execute();

    expect(resultado).toEqual([vendedora]);
  });

  it('nao chama o repositorio com filtros adicionais (sem widening)', async () => {
    repo.listar.mockResolvedValue([]);

    await useCase.execute();

    const filtros = repo.listar.mock.calls[0][0];
    expect(Object.keys(filtros).sort()).toEqual(['ativo', 'statusDisponibilidade']);
  });
});
