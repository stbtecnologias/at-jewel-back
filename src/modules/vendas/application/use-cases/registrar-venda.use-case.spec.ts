import { BadRequestException, ConflictException } from '@nestjs/common';
import { Venda } from '../../domain/entities/venda.entity';
import { IVendaRepository } from '../../domain/ports/repositories/venda-repository.port';
import {
  RegistrarVendaInput,
  RegistrarVendaUseCase,
} from './registrar-venda.use-case';

function makeRepoMock(): jest.Mocked<IVendaRepository> {
  return {
    criarComAgregado: jest.fn(),
    upsertByCodigoErp: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    listar: jest.fn(),
  } as unknown as jest.Mocked<IVendaRepository>;
}

// Venda coerente: bruto 200, desconto 20, total 180; um item de 180;
// dois pagamentos somando 180.
function vendaValida(over: Partial<RegistrarVendaInput> = {}): RegistrarVendaInput {
  return {
    dataVenda: new Date('2026-05-10T14:00:00Z'),
    valorBruto: 200,
    valorDesconto: 20,
    valorTotal: 180,
    itens: [
      {
        quantidade: 1,
        valorUnitario: 200,
        valorDescontoItem: 20,
        valorTotalItem: 180,
      },
    ],
    pagamentos: [
      { formaPagamento: 'pix', valor: 100 },
      { formaPagamento: 'cartao_credito', valor: 80, parcelas: 2, valorParcela: 40 },
    ],
    ...over,
  };
}

describe('RegistrarVendaUseCase', () => {
  let useCase: RegistrarVendaUseCase;
  let repo: jest.Mocked<IVendaRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new RegistrarVendaUseCase(repo);
  });

  it('registra venda valida criando o agregado em transacao', async () => {
    repo.buscarPorCodigoErp.mockResolvedValue(null);
    const persistida = Venda.create({
      id: 'v1',
      dataVenda: new Date('2026-05-10T14:00:00Z'),
      valorBruto: 200,
      valorDesconto: 20,
      valorTotal: 180,
    });
    repo.criarComAgregado.mockResolvedValue(persistida);

    const resultado = await useCase.execute(vendaValida({ codigoErp: 'ERP-1' }));

    expect(resultado).toBe(persistida);
    expect(repo.criarComAgregado).toHaveBeenCalledTimes(1);
    const arg = repo.criarComAgregado.mock.calls[0][0];
    expect(arg.itens).toHaveLength(1);
    expect(arg.pagamentos).toHaveLength(2);
    expect(arg.status).toBe('concluida');
  });

  it('rejeita quando valor_total nao bate com bruto - desconto', async () => {
    await expect(
      useCase.execute(vendaValida({ valorTotal: 150 })),
    ).rejects.toThrow(BadRequestException);
    expect(repo.criarComAgregado).not.toHaveBeenCalled();
  });

  it('rejeita quando soma dos pagamentos nao bate com valor_total', async () => {
    await expect(
      useCase.execute(
        vendaValida({
          pagamentos: [{ formaPagamento: 'pix', valor: 100 }],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repo.criarComAgregado).not.toHaveBeenCalled();
  });

  it('aceita diferenca de 1 centavo (tolerancia de arredondamento)', async () => {
    repo.buscarPorCodigoErp.mockResolvedValue(null);
    repo.criarComAgregado.mockResolvedValue({} as Venda);

    // total 180.00, pagamentos 179.99 + 80.01 = 260? Nao. Usamos
    // um caso real: total 100.00 com pagamento 100.01 (1 centavo).
    await expect(
      useCase.execute({
        dataVenda: new Date('2026-05-10T14:00:00Z'),
        valorBruto: 100,
        valorDesconto: 0,
        valorTotal: 100,
        itens: [{ quantidade: 1, valorUnitario: 100, valorTotalItem: 100 }],
        pagamentos: [{ formaPagamento: 'dinheiro', valor: 100.01 }],
      }),
    ).resolves.toBeDefined();
    expect(repo.criarComAgregado).toHaveBeenCalledTimes(1);
  });

  it('rejeita venda sem itens', async () => {
    await expect(
      useCase.execute(vendaValida({ itens: [] })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita venda sem pagamentos', async () => {
    await expect(
      useCase.execute(vendaValida({ pagamentos: [] })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita codigo ERP ja registrado (idempotencia)', async () => {
    repo.buscarPorCodigoErp.mockResolvedValue(
      Venda.create({
        id: 'existente',
        dataVenda: new Date('2026-01-01'),
        valorBruto: 1,
        valorTotal: 1,
      }),
    );

    await expect(
      useCase.execute(vendaValida({ codigoErp: 'ERP-DUP' })),
    ).rejects.toThrow(ConflictException);
    expect(repo.criarComAgregado).not.toHaveBeenCalled();
  });

  it('nao consulta codigo ERP quando ele nao e informado', async () => {
    repo.criarComAgregado.mockResolvedValue({} as Venda);

    await useCase.execute(vendaValida());

    expect(repo.buscarPorCodigoErp).not.toHaveBeenCalled();
    expect(repo.criarComAgregado).toHaveBeenCalledTimes(1);
  });
});
