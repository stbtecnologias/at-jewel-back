import { NotFoundException } from '@nestjs/common';
import type { IVendaRepository } from '../../../vendas/domain/ports/repositories/venda-repository.port';
import { Cliente } from '../../domain/entities/cliente.entity';
import type { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { BuscarHistoricoClienteUseCase } from './buscar-historico-cliente.use-case';

function makeClienteRepoMock(): jest.Mocked<IClienteRepository> {
  return {
    criarComPerfil: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    buscarPorTelefone1Hash: jest.fn(),
    buscarPorEmailHash: jest.fn(),
    listar: jest.fn(),
    atualizar: jest.fn(),
  } as unknown as jest.Mocked<IClienteRepository>;
}

function makeVendaRepoMock(): jest.Mocked<IVendaRepository> {
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

function clienteFake(id: string): Cliente {
  return Cliente.create({
    id,
    nome: 'Cliente Teste',
    tipoPessoa: 'fisica',
    tabelaPreco: 'varejo',
    ativo: true,
  });
}

describe('BuscarHistoricoClienteUseCase', () => {
  let useCase: BuscarHistoricoClienteUseCase;
  let clienteRepo: jest.Mocked<IClienteRepository>;
  let vendaRepo: jest.Mocked<IVendaRepository>;
  const clienteId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    clienteRepo = makeClienteRepoMock();
    vendaRepo = makeVendaRepoMock();
    useCase = new BuscarHistoricoClienteUseCase(clienteRepo, vendaRepo);
  });

  it('lanca NotFound quando o cliente nao existe e nao consulta vendas', async () => {
    clienteRepo.buscarPorId.mockResolvedValue(null);

    await expect(useCase.execute(clienteId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(vendaRepo.listarHistoricoPorCliente).not.toHaveBeenCalled();
  });

  it('retorna o historico agregado quando o cliente existe', async () => {
    clienteRepo.buscarPorId.mockResolvedValue(clienteFake(clienteId));
    const ultima = new Date('2026-05-20');
    vendaRepo.listarHistoricoPorCliente.mockResolvedValue({
      resumo: {
        totalCompras: 2,
        valorTotal: 600,
        ticketMedio: 300,
        ultimaCompraEm: ultima,
      },
      vendas: [
        {
          id: 'v1',
          dataVenda: ultima,
          valorTotal: 400,
          status: 'concluida',
          vendedoraId: 'vend1',
          qtdItens: 3,
        },
      ],
    });

    const resultado = await useCase.execute(clienteId, {
      limit: 10,
      offset: 0,
    });

    expect(vendaRepo.listarHistoricoPorCliente).toHaveBeenCalledWith(
      clienteId,
      { limit: 10, offset: 0 },
    );
    expect(resultado.resumo.totalCompras).toBe(2);
    expect(resultado.resumo.ticketMedio).toBe(300);
    expect(resultado.vendas).toHaveLength(1);
    expect(resultado.vendas[0].qtdItens).toBe(3);
  });

  it('cliente sem compras retorna resumo zerado e lista vazia', async () => {
    clienteRepo.buscarPorId.mockResolvedValue(clienteFake(clienteId));
    vendaRepo.listarHistoricoPorCliente.mockResolvedValue({
      resumo: {
        totalCompras: 0,
        valorTotal: 0,
        ticketMedio: 0,
        ultimaCompraEm: null,
      },
      vendas: [],
    });

    const resultado = await useCase.execute(clienteId);

    expect(resultado.resumo).toEqual({
      totalCompras: 0,
      valorTotal: 0,
      ticketMedio: 0,
      ultimaCompraEm: null,
    });
    expect(resultado.vendas).toEqual([]);
  });
});
