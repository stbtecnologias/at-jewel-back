import { IVendaRepository } from '../../domain/ports/repositories/venda-repository.port';
import { ResumoVendasUseCase } from './resumo-vendas.use-case';

function makeRepoMock(): jest.Mocked<IVendaRepository> {
  return {
    criarComAgregado: jest.fn(),
    upsertByCodigoErp: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    listar: jest.fn(),
    listarVendedoraIdsPorCliente: jest.fn(),
    resumoAgregado: jest.fn(),
    listarHistoricoPorCliente: jest.fn(),
  } as unknown as jest.Mocked<IVendaRepository>;
}

describe('ResumoVendasUseCase', () => {
  let useCase: ResumoVendasUseCase;
  let repo: jest.Mocked<IVendaRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new ResumoVendasUseCase(repo);
  });

  it('repassa filtros ao repository e ecoa o periodo aplicado', async () => {
    const dataDe = new Date('2026-05-01');
    const dataAte = new Date('2026-05-31');
    repo.resumoAgregado.mockResolvedValue({
      totalVendas: 3,
      receitaTotal: 900,
      ticketMedio: 300,
      totalItens: 7,
      porStatus: { concluida: 3, cancelada: 1, pendente: 2 },
    });

    const resultado = await useCase.execute({
      dataDe,
      dataAte,
      vendedoraId: 'vend1',
    });

    expect(repo.resumoAgregado).toHaveBeenCalledWith({
      dataDe,
      dataAte,
      vendedoraId: 'vend1',
    });
    expect(resultado).toEqual({
      totalVendas: 3,
      receitaTotal: 900,
      ticketMedio: 300,
      totalItens: 7,
      porStatus: { concluida: 3, cancelada: 1, pendente: 2 },
      periodo: { de: dataDe, ate: dataAte },
    });
  });

  it('sem filtros de periodo retorna periodo { de: null, ate: null }', async () => {
    repo.resumoAgregado.mockResolvedValue({
      totalVendas: 0,
      receitaTotal: 0,
      ticketMedio: 0,
      totalItens: 0,
      porStatus: { concluida: 0, cancelada: 0, pendente: 0 },
    });

    const resultado = await useCase.execute({});

    expect(repo.resumoAgregado).toHaveBeenCalledWith({});
    expect(resultado.periodo).toEqual({ de: null, ate: null });
    expect(resultado.totalVendas).toBe(0);
    expect(resultado.ticketMedio).toBe(0);
  });

  it('preserva os agregados calculados pelo repository (incluindo porStatus)', async () => {
    repo.resumoAgregado.mockResolvedValue({
      totalVendas: 2,
      receitaTotal: 500,
      ticketMedio: 250,
      totalItens: 4,
      porStatus: { concluida: 2, cancelada: 0, pendente: 0 },
    });

    const resultado = await useCase.execute({ status: 'concluida' });

    expect(resultado.receitaTotal).toBe(500);
    expect(resultado.porStatus).toEqual({
      concluida: 2,
      cancelada: 0,
      pendente: 0,
    });
  });
});
