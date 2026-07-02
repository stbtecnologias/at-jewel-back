import { NotFoundException } from '@nestjs/common';
import { Consignacao } from '../../domain/entities/consignacao.entity';
import {
  ConsignacaoItem,
  IConsignacaoRepository,
} from '../../domain/ports/repositories/consignacao-repository.port';
import { AtualizarConsignacaoUseCase } from './atualizar-consignacao.use-case';

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

function consignacaoAberta(over: Partial<Parameters<typeof Consignacao.create>[0]> = {}) {
  return Consignacao.create({
    id: 'con-1',
    produtoId: 'prod-1',
    quantidade: 1,
    destinoTipo: 'VENDEDORA',
    vendedoraId: 'vend-1',
    status: 'ABERTA',
    dataRetorno: null,
    ...over,
  });
}

function itemStub(over: Partial<ConsignacaoItem> = {}): ConsignacaoItem {
  return {
    id: 'con-1',
    produtoId: 'prod-1',
    produtoNome: 'Anel Solitario',
    quantidade: 1,
    destinoTipo: 'VENDEDORA',
    clienteId: null,
    clienteNome: null,
    vendedoraId: 'vend-1',
    vendedoraNome: 'Faby',
    status: 'ABERTA',
    dataSaida: new Date('2026-06-01T10:00:00Z'),
    dataPrevistaRetorno: null,
    dataRetorno: null,
    observacao: null,
    createdAt: new Date('2026-06-01T10:00:00Z'),
    ...over,
  };
}

describe('AtualizarConsignacaoUseCase', () => {
  let useCase: AtualizarConsignacaoUseCase;
  let repo: jest.Mocked<IConsignacaoRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new AtualizarConsignacaoUseCase(repo);
  });

  it('lanca NotFound quando a consignacao nao existe', async () => {
    repo.buscarPorId.mockResolvedValue(null);
    await expect(useCase.execute('inexistente', { status: 'DEVOLVIDA' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.atualizar).not.toHaveBeenCalled();
  });

  it('ao marcar DEVOLVIDA sem dataRetorno explicita, carimba now()', async () => {
    repo.buscarPorId.mockResolvedValue(consignacaoAberta());
    repo.atualizar.mockResolvedValue(itemStub({ status: 'DEVOLVIDA' }));

    const antes = Date.now();
    await useCase.execute('con-1', { status: 'DEVOLVIDA' });
    const depois = Date.now();

    expect(repo.atualizar).toHaveBeenCalledTimes(1);
    const [, dados] = repo.atualizar.mock.calls[0];
    expect(dados.status).toBe('DEVOLVIDA');
    expect(dados.dataRetorno).toBeInstanceOf(Date);
    const ts = (dados.dataRetorno as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(antes);
    expect(ts).toBeLessThanOrEqual(depois);
  });

  it('ao marcar VENDIDA com dataRetorno explicita, respeita a data informada', async () => {
    repo.buscarPorId.mockResolvedValue(consignacaoAberta());
    repo.atualizar.mockResolvedValue(itemStub({ status: 'VENDIDA' }));

    const dataRetorno = new Date('2026-06-10T09:00:00Z');
    await useCase.execute('con-1', { status: 'VENDIDA', dataRetorno });

    const [, dados] = repo.atualizar.mock.calls[0];
    expect(dados.dataRetorno).toBe(dataRetorno);
  });

  it('nao sobrescreve dataRetorno ja existente ao mudar de estado terminal', async () => {
    const jaRetornada = consignacaoAberta({
      status: 'DEVOLVIDA',
      dataRetorno: new Date('2026-06-05T00:00:00Z'),
    });
    repo.buscarPorId.mockResolvedValue(jaRetornada);
    repo.atualizar.mockResolvedValue(itemStub({ status: 'VENDIDA' }));

    await useCase.execute('con-1', { status: 'VENDIDA' });

    const [, dados] = repo.atualizar.mock.calls[0];
    expect(dados.dataRetorno).toBeUndefined();
  });

  it('atualizacao apenas de observacao nao carimba dataRetorno', async () => {
    repo.buscarPorId.mockResolvedValue(consignacaoAberta());
    repo.atualizar.mockResolvedValue(itemStub({ observacao: 'nova nota' }));

    await useCase.execute('con-1', { observacao: 'nova nota' });

    const [, dados] = repo.atualizar.mock.calls[0];
    expect(dados.dataRetorno).toBeUndefined();
    expect(dados.observacao).toBe('nova nota');
  });
});
