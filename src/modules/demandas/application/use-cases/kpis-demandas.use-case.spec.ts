import {
  IDemandaRepository,
  KpisDemandas,
} from '../../domain/ports/repositories/demanda-repository.port';
import { KpisDemandasUseCase } from './kpis-demandas.use-case';

function makeRepoMock(): jest.Mocked<IDemandaRepository> {
  return {
    criar: jest.fn(),
    listar: jest.fn(),
    buscarItemPorId: jest.fn(),
    buscarPorId: jest.fn(),
    atualizar: jest.fn(),
    kpis: jest.fn(),
    buscarNomeUsuario: jest.fn(),
  } as unknown as jest.Mocked<IDemandaRepository>;
}

describe('KpisDemandasUseCase', () => {
  let useCase: KpisDemandasUseCase;
  let repo: jest.Mocked<IDemandaRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new KpisDemandasUseCase(repo);
  });

  it('repassa os kpis calculados pelo repositorio', async () => {
    const kpis: KpisDemandas = {
      abertas: 3,
      emAndamento: 2,
      concluidas30d: 5,
      tempoMedioConclusaoHoras: 12.5,
    };
    repo.kpis.mockResolvedValue(kpis);

    const resultado = await useCase.execute();

    expect(repo.kpis).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual(kpis);
  });
});
