import { NotFoundException } from '@nestjs/common';
import { Demanda } from '../../domain/entities/demanda.entity';
import {
  DemandaItem,
  IDemandaRepository,
} from '../../domain/ports/repositories/demanda-repository.port';
import { AtualizarDemandaUseCase } from './atualizar-demanda.use-case';

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

function demandaAberta(over: Partial<Parameters<typeof Demanda.create>[0]> = {}) {
  return Demanda.create({
    id: 'dem-1',
    solicitanteNome: 'Ana',
    tipo: 'AJUSTE',
    descricao: 'Ajustar filtro',
    status: 'ABERTA',
    concluidaEm: null,
    ...over,
  });
}

function itemStub(over: Partial<DemandaItem> = {}): DemandaItem {
  return {
    id: 'dem-1',
    solicitanteNome: 'Ana',
    canal: 'MANUAL',
    tipo: 'AJUSTE',
    descricao: 'Ajustar filtro',
    status: 'ABERTA',
    resposta: null,
    createdAt: new Date('2026-06-01T10:00:00Z'),
    atualizadaEm: new Date('2026-06-01T10:00:00Z'),
    concluidaEm: null,
    ...over,
  };
}

describe('AtualizarDemandaUseCase', () => {
  let useCase: AtualizarDemandaUseCase;
  let repo: jest.Mocked<IDemandaRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new AtualizarDemandaUseCase(repo);
  });

  it('lanca NotFound quando a demanda nao existe', async () => {
    repo.buscarPorId.mockResolvedValue(null);
    await expect(
      useCase.execute('inexistente', { status: 'CONCLUIDA' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.atualizar).not.toHaveBeenCalled();
  });

  it('ao concluir sem concluida_em previa, carimba now()', async () => {
    repo.buscarPorId.mockResolvedValue(demandaAberta());
    repo.atualizar.mockResolvedValue(itemStub({ status: 'CONCLUIDA' }));

    const antes = Date.now();
    await useCase.execute('dem-1', { status: 'CONCLUIDA' });
    const depois = Date.now();

    const [, dados] = repo.atualizar.mock.calls[0];
    expect(dados.status).toBe('CONCLUIDA');
    expect(dados.concluidaEm).toBeInstanceOf(Date);
    const ts = (dados.concluidaEm as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(antes);
    expect(ts).toBeLessThanOrEqual(depois);
  });

  it('nao sobrescreve concluida_em ja existente ao reenviar CONCLUIDA', async () => {
    repo.buscarPorId.mockResolvedValue(
      demandaAberta({ status: 'CONCLUIDA', concluidaEm: new Date('2026-06-05T00:00:00Z') }),
    );
    repo.atualizar.mockResolvedValue(itemStub({ status: 'CONCLUIDA' }));

    await useCase.execute('dem-1', { status: 'CONCLUIDA', resposta: 'feito' });

    const [, dados] = repo.atualizar.mock.calls[0];
    expect(dados.concluidaEm).toBeUndefined();
    expect(dados.resposta).toBe('feito');
  });

  it('mudanca para EM_ANDAMENTO nao carimba concluida_em', async () => {
    repo.buscarPorId.mockResolvedValue(demandaAberta());
    repo.atualizar.mockResolvedValue(itemStub({ status: 'EM_ANDAMENTO' }));

    await useCase.execute('dem-1', { status: 'EM_ANDAMENTO' });

    const [, dados] = repo.atualizar.mock.calls[0];
    expect(dados.concluidaEm).toBeUndefined();
    expect(dados.status).toBe('EM_ANDAMENTO');
  });

  it('atualizacao apenas de resposta nao mexe em status/concluida_em', async () => {
    repo.buscarPorId.mockResolvedValue(demandaAberta());
    repo.atualizar.mockResolvedValue(itemStub({ resposta: 'em analise' }));

    await useCase.execute('dem-1', { resposta: 'em analise' });

    const [, dados] = repo.atualizar.mock.calls[0];
    expect(dados.status).toBeUndefined();
    expect(dados.concluidaEm).toBeUndefined();
    expect(dados.resposta).toBe('em analise');
  });
});
