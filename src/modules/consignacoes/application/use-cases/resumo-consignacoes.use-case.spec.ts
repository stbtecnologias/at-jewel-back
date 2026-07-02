import { IConsignacaoRepository } from '../../domain/ports/repositories/consignacao-repository.port';
import { ResumoConsignacoesUseCase } from './resumo-consignacoes.use-case';

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

describe('ResumoConsignacoesUseCase', () => {
  let useCase: ResumoConsignacoesUseCase;
  let repo: jest.Mocked<IConsignacaoRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new ResumoConsignacoesUseCase(repo);
  });

  it('repassa os KPIs calculados pelo repository', async () => {
    repo.resumo.mockResolvedValue({ abertas: 4, pecasFora: 9, valorEstimado: 12500.5 });

    const resultado = await useCase.execute();

    expect(repo.resumo).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ abertas: 4, pecasFora: 9, valorEstimado: 12500.5 });
  });

  it('propaga o zero quando nao ha consignacoes abertas', async () => {
    repo.resumo.mockResolvedValue({ abertas: 0, pecasFora: 0, valorEstimado: 0 });

    const resultado = await useCase.execute();

    expect(resultado).toEqual({ abertas: 0, pecasFora: 0, valorEstimado: 0 });
  });
});
