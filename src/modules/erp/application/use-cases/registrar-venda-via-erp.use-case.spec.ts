import { BadRequestException, Logger } from '@nestjs/common';
import { Cliente } from '../../../clientes/domain/entities/cliente.entity';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { Venda } from '../../../vendas/domain/entities/venda.entity';
import type { IVendaRepository } from '../../../vendas/domain/ports/repositories/venda-repository.port';
import { Vendedora } from '../../../vendedoras/domain/entities/vendedora.entity';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import { Produto } from '../../domain/entities/produto.entity';
import type { IErpEventoRepository } from '../../domain/ports/repositories/erp-evento-repository.port';
import type { IProdutoRepository } from '../../domain/ports/repositories/produto-repository.port';
import {
  RegistrarVendaViaErpInput,
  RegistrarVendaViaErpUseCase,
} from './registrar-venda-via-erp.use-case';

function vendaRepoMock(): jest.Mocked<IVendaRepository> {
  return {
    criarComAgregado: jest.fn(),
    upsertByCodigoErp: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    listar: jest.fn(),
  } as unknown as jest.Mocked<IVendaRepository>;
}

function eventoRepoMock(): jest.Mocked<IErpEventoRepository> {
  return {
    jaProcessado: jest.fn(),
    marcarComoProcessado: jest.fn(),
  } as unknown as jest.Mocked<IErpEventoRepository>;
}

function clienteRepoMock(): jest.Mocked<IClienteRepository> {
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

function vendedoraRepoMock(): jest.Mocked<IVendedoraRepository> {
  return {
    criar: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    buscarPorEmailHash: jest.fn(),
    buscarPorWhatsappHash: jest.fn(),
    listar: jest.fn(),
    atualizar: jest.fn(),
  } as unknown as jest.Mocked<IVendedoraRepository>;
}

function produtoRepoMock(): jest.Mocked<IProdutoRepository> {
  return {
    upsertByCodigoErp: jest.fn(),
    findByCodigoErp: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
    remover: jest.fn(),
  } as unknown as jest.Mocked<IProdutoRepository>;
}

// Venda coerente: bruto 200, desconto 20, total 180; item 180; pagamento 180.
function vendaValida(
  over: Partial<RegistrarVendaViaErpInput> = {},
): RegistrarVendaViaErpInput {
  return {
    eventoId: '11111111-1111-1111-1111-111111111111',
    codigoErp: 'VENDA-1',
    dataVenda: new Date('2026-05-10T14:00:00Z'),
    valorBruto: 200,
    valorDesconto: 20,
    valorTotal: 180,
    itens: [
      {
        produtoCodigoErp: 'PROD-1',
        quantidade: 1,
        valorUnitario: 200,
        valorDescontoItem: 20,
        valorTotalItem: 180,
      },
    ],
    pagamentos: [{ formaPagamento: 'pix', valor: 180 }],
    ...over,
  };
}

function fakeCliente(id: string): Cliente {
  return Cliente.create({
    id,
    nome: 'X',
    tipoPessoa: 'fisica',
    tabelaPreco: 'varejo',
    ativo: true,
  } as never);
}

function fakeVendedora(id: string): Vendedora {
  return Vendedora.create({
    id,
    nome: 'Y',
    tipo: 'LOCAL',
    ativo: true,
    statusDisponibilidade: 'DISPONIVEL',
  } as never);
}

function fakeProduto(id: string): Produto {
  return Produto.create({
    id,
    codigoErp: 'PROD-1',
    categoria: 'aneis',
    familia: 'ouro',
    unidade: 'un',
    valorVenda: 100,
    ativo: true,
  } as never);
}

describe('RegistrarVendaViaErpUseCase', () => {
  let useCase: RegistrarVendaViaErpUseCase;
  let vendaRepo: jest.Mocked<IVendaRepository>;
  let eventoRepo: jest.Mocked<IErpEventoRepository>;
  let clienteRepo: jest.Mocked<IClienteRepository>;
  let vendedoraRepo: jest.Mocked<IVendedoraRepository>;
  let produtoRepo: jest.Mocked<IProdutoRepository>;

  beforeEach(() => {
    vendaRepo = vendaRepoMock();
    eventoRepo = eventoRepoMock();
    clienteRepo = clienteRepoMock();
    vendedoraRepo = vendedoraRepoMock();
    produtoRepo = produtoRepoMock();
    useCase = new RegistrarVendaViaErpUseCase(
      vendaRepo,
      eventoRepo,
      clienteRepo,
      vendedoraRepo,
      produtoRepo,
    );
    // Silencia o Logger.warn esperado nos cenarios de FK nao encontrada.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retorna idempotente quando o evento ja foi processado', async () => {
    eventoRepo.jaProcessado.mockResolvedValue(true);

    const out = await useCase.execute(vendaValida());

    expect(out).toEqual({ idempotente: true });
    expect(vendaRepo.upsertByCodigoErp).not.toHaveBeenCalled();
    expect(eventoRepo.marcarComoProcessado).not.toHaveBeenCalled();
  });

  it('cria venda nova resolvendo FKs e marca evento como processado', async () => {
    eventoRepo.jaProcessado.mockResolvedValue(false);
    clienteRepo.buscarPorCodigoErp.mockResolvedValue(fakeCliente('cli-1'));
    vendedoraRepo.buscarPorCodigoErp.mockResolvedValue(fakeVendedora('vend-1'));
    produtoRepo.findByCodigoErp.mockResolvedValue(fakeProduto('prod-1'));
    vendaRepo.upsertByCodigoErp.mockResolvedValue({} as Venda);

    const out = await useCase.execute(
      vendaValida({
        clienteCodigoErp: 'CLI-1',
        vendedoraCodigoErp: 'VEND-1',
      }),
    );

    expect(out).toEqual({ idempotente: false });
    expect(vendaRepo.upsertByCodigoErp).toHaveBeenCalledTimes(1);
    const venda = vendaRepo.upsertByCodigoErp.mock.calls[0][0];
    expect(venda.codigoErp).toBe('VENDA-1');
    expect(venda.clienteId).toBe('cli-1');
    expect(venda.vendedoraId).toBe('vend-1');
    expect(venda.itens).toHaveLength(1);
    expect(venda.itens[0].produtoId).toBe('prod-1');
    expect(eventoRepo.marcarComoProcessado).toHaveBeenCalledWith(
      vendaValida().eventoId,
      'VENDA',
    );
  });

  it('faz upsert de venda existente (reenvio do ERP, ex.: cancelamento)', async () => {
    eventoRepo.jaProcessado.mockResolvedValue(false);
    produtoRepo.findByCodigoErp.mockResolvedValue(fakeProduto('prod-1'));
    vendaRepo.upsertByCodigoErp.mockResolvedValue({} as Venda);

    const out = await useCase.execute(
      vendaValida({ status: 'cancelada' }),
    );

    expect(out).toEqual({ idempotente: false });
    expect(vendaRepo.upsertByCodigoErp).toHaveBeenCalledTimes(1);
    expect(vendaRepo.upsertByCodigoErp.mock.calls[0][0].status).toBe(
      'cancelada',
    );
  });

  it('persiste FK NULL e avisa quando o codigo_erp nao e encontrado', async () => {
    eventoRepo.jaProcessado.mockResolvedValue(false);
    clienteRepo.buscarPorCodigoErp.mockResolvedValue(null);
    vendedoraRepo.buscarPorCodigoErp.mockResolvedValue(null);
    produtoRepo.findByCodigoErp.mockResolvedValue(null);
    vendaRepo.upsertByCodigoErp.mockResolvedValue({} as Venda);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');

    const out = await useCase.execute(
      vendaValida({
        clienteCodigoErp: 'CLI-INEXISTENTE',
        vendedoraCodigoErp: 'VEND-INEXISTENTE',
      }),
    );

    expect(out).toEqual({ idempotente: false });
    const venda = vendaRepo.upsertByCodigoErp.mock.calls[0][0];
    expect(venda.clienteId).toBeNull();
    expect(venda.vendedoraId).toBeNull();
    expect(venda.itens[0].produtoId).toBeNull();
    // Tres avisos: cliente, vendedora e produto nao encontrados.
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it('rejeita quando o somatorio nao confere (BadRequest), sem persistir', async () => {
    eventoRepo.jaProcessado.mockResolvedValue(false);
    produtoRepo.findByCodigoErp.mockResolvedValue(fakeProduto('prod-1'));

    await expect(
      useCase.execute(vendaValida({ valorTotal: 150 })),
    ).rejects.toThrow(BadRequestException);

    expect(vendaRepo.upsertByCodigoErp).not.toHaveBeenCalled();
    expect(eventoRepo.marcarComoProcessado).not.toHaveBeenCalled();
  });
});
