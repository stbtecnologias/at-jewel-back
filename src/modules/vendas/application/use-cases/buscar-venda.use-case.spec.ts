import { NotFoundException } from '@nestjs/common';
import { Venda } from '../../domain/entities/venda.entity';
import { IVendaRepository } from '../../domain/ports/repositories/venda-repository.port';
import { BuscarVendaUseCase } from './buscar-venda.use-case';

function makeRepoMock(): jest.Mocked<IVendaRepository> {
  return {
    criarComAgregado: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    listar: jest.fn(),
  } as unknown as jest.Mocked<IVendaRepository>;
}

describe('BuscarVendaUseCase', () => {
  let useCase: BuscarVendaUseCase;
  let repo: jest.Mocked<IVendaRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new BuscarVendaUseCase(repo);
  });

  it('retorna a venda com o agregado quando encontrada', async () => {
    const venda = Venda.create({
      id: 'v1',
      dataVenda: new Date('2026-05-01'),
      valorBruto: 100,
      valorTotal: 100,
    });
    repo.buscarPorId.mockResolvedValue(venda);

    const resultado = await useCase.execute('v1');

    expect(resultado).toBe(venda);
    expect(repo.buscarPorId).toHaveBeenCalledWith('v1', { incluirAgregado: true });
  });

  it('lanca NotFoundException quando a venda nao existe', async () => {
    repo.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(NotFoundException);
  });
});
