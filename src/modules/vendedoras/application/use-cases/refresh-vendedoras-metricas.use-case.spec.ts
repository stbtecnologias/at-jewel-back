import { IVendedoraMetricasRepository } from '../../domain/ports/repositories/vendedora-metricas-repository.port';
import { RefreshVendedorasMetricasUseCase } from './refresh-vendedoras-metricas.use-case';

function makeRepoMock(): jest.Mocked<IVendedoraMetricasRepository> {
  return {
    listar: jest.fn(),
    buscarPorVendedoraId: jest.fn(),
    refresh: jest.fn(),
  } as unknown as jest.Mocked<IVendedoraMetricasRepository>;
}

describe('RefreshVendedorasMetricasUseCase', () => {
  let useCase: RefreshVendedorasMetricasUseCase;
  let repo: jest.Mocked<IVendedoraMetricasRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new RefreshVendedorasMetricasUseCase(repo);
  });

  it('dispara o refresh da matview e retorna o carimbo de atualizacao', async () => {
    repo.refresh.mockResolvedValue();

    const antes = Date.now();
    const resultado = await useCase.execute();
    const depois = Date.now();

    expect(repo.refresh).toHaveBeenCalledTimes(1);
    expect(resultado.atualizadoEm).toBeInstanceOf(Date);
    expect(resultado.atualizadoEm.getTime()).toBeGreaterThanOrEqual(antes);
    expect(resultado.atualizadoEm.getTime()).toBeLessThanOrEqual(depois);
  });

  it('propaga erro quando o refresh falha', async () => {
    repo.refresh.mockRejectedValue(new Error('refresh falhou'));

    await expect(useCase.execute()).rejects.toThrow('refresh falhou');
  });
});
