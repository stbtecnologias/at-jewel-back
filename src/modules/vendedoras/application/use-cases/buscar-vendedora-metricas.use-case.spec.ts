import { NotFoundException } from '@nestjs/common';
import { VendedoraMetricas } from '../../domain/entities/vendedora-metricas.entity';
import { IVendedoraMetricasRepository } from '../../domain/ports/repositories/vendedora-metricas-repository.port';
import { BuscarVendedoraMetricasUseCase } from './buscar-vendedora-metricas.use-case';

function makeRepoMock(): jest.Mocked<IVendedoraMetricasRepository> {
  return {
    listar: jest.fn(),
    buscarPorVendedoraId: jest.fn(),
    refresh: jest.fn(),
  } as unknown as jest.Mocked<IVendedoraMetricasRepository>;
}

describe('BuscarVendedoraMetricasUseCase', () => {
  let useCase: BuscarVendedoraMetricasUseCase;
  let repo: jest.Mocked<IVendedoraMetricasRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new BuscarVendedoraMetricasUseCase(repo);
  });

  it('retorna as metricas quando a vendedora tem linha na matview', async () => {
    const metricas = VendedoraMetricas.create({
      vendedoraId: 'v1',
      totalVendas: 5,
      receitaTotal: 1500,
      ticketMedio: 300,
      clientesDistintos: 4,
      clientesRecorrentes: 1,
      taxaRecompra: 0.25,
      tempoMedioFechamentoHoras: null,
      primeiraVendaEm: new Date('2026-02-01'),
      ultimaVendaEm: new Date('2026-05-20'),
      atualizadoEm: new Date('2026-06-07'),
    });
    repo.buscarPorVendedoraId.mockResolvedValue(metricas);

    const resultado = await useCase.execute('v1');

    expect(resultado).toBe(metricas);
    expect(repo.buscarPorVendedoraId).toHaveBeenCalledWith('v1');
  });

  it('lanca NotFoundException quando nao ha metricas para a vendedora', async () => {
    repo.buscarPorVendedoraId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(
      NotFoundException,
    );
  });
});
