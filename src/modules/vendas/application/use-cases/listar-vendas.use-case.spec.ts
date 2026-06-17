import {
  IVendaRepository,
  VendaResumo,
} from '../../domain/ports/repositories/venda-repository.port';
import { ListarVendasUseCase } from './listar-vendas.use-case';

function makeRepoMock(): jest.Mocked<IVendaRepository> {
  return {
    criarComAgregado: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    listar: jest.fn(),
  } as unknown as jest.Mocked<IVendaRepository>;
}

describe('ListarVendasUseCase', () => {
  let useCase: ListarVendasUseCase;
  let repo: jest.Mocked<IVendaRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new ListarVendasUseCase(repo);
  });

  it('repassa filtros direto para o repository', async () => {
    const vendas: VendaResumo[] = [
      {
        id: 'v1',
        codigoErp: null,
        clienteId: null,
        vendedoraId: 'vend1',
        vendedoraNome: 'Ana',
        dataVenda: new Date('2026-05-01'),
        dataContato: null,
        valorBruto: 100,
        valorDesconto: 0,
        valorTotal: 100,
        status: 'concluida',
        ativo: true,
        produtoPrincipal: 'Colar',
        qtdItens: 1,
        formasPagamento: ['pix'],
        criadoEm: new Date('2026-05-01'),
        atualizadoEm: new Date('2026-05-01'),
      },
    ];
    repo.listar.mockResolvedValue(vendas);

    const dataDe = new Date('2026-05-01');
    const resultado = await useCase.execute({ dataDe, vendedoraId: 'vend1' });

    expect(resultado).toBe(vendas);
    expect(repo.listar).toHaveBeenCalledWith({ dataDe, vendedoraId: 'vend1' });
  });

  it('aceita filtros vazios', async () => {
    repo.listar.mockResolvedValue([]);

    const resultado = await useCase.execute({});

    expect(resultado).toEqual([]);
    expect(repo.listar).toHaveBeenCalledWith({});
  });
});
