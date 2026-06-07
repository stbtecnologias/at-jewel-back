import { VendedoraMetricas } from '../../domain/entities/vendedora-metricas.entity';
import { IVendedoraMetricasRepository } from '../../domain/ports/repositories/vendedora-metricas-repository.port';
import { ListarVendedorasMetricasUseCase } from './listar-vendedoras-metricas.use-case';

function makeRepoMock(): jest.Mocked<IVendedoraMetricasRepository> {
  return {
    listar: jest.fn(),
    buscarPorVendedoraId: jest.fn(),
    refresh: jest.fn(),
  } as unknown as jest.Mocked<IVendedoraMetricasRepository>;
}

function makeMetricas(vendedoraId: string): VendedoraMetricas {
  return VendedoraMetricas.create({
    vendedoraId,
    totalVendas: 3,
    receitaTotal: 900,
    ticketMedio: 300,
    clientesDistintos: 2,
    clientesRecorrentes: 1,
    taxaRecompra: 0.5,
    tempoMedioFechamentoHoras: 12,
    primeiraVendaEm: new Date('2026-01-01'),
    ultimaVendaEm: new Date('2026-05-01'),
    atualizadoEm: new Date('2026-06-07'),
  });
}

describe('ListarVendedorasMetricasUseCase', () => {
  let useCase: ListarVendedorasMetricasUseCase;
  let repo: jest.Mocked<IVendedoraMetricasRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new ListarVendedorasMetricasUseCase(repo);
  });

  it('retorna a lista de metricas vinda do repositorio', async () => {
    const lista = [makeMetricas('v1'), makeMetricas('v2')];
    repo.listar.mockResolvedValue(lista);

    const resultado = await useCase.execute();

    expect(resultado).toBe(lista);
    expect(repo.listar).toHaveBeenCalledTimes(1);
  });

  it('retorna lista vazia quando nao ha metricas materializadas', async () => {
    repo.listar.mockResolvedValue([]);

    const resultado = await useCase.execute();

    expect(resultado).toEqual([]);
  });
});
