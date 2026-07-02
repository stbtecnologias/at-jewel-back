import { BadRequestException } from '@nestjs/common';
import { Demanda } from '../../domain/entities/demanda.entity';
import { IDemandaRepository } from '../../domain/ports/repositories/demanda-repository.port';
import { CriarDemandaUseCase } from './criar-demanda.use-case';

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

describe('CriarDemandaUseCase', () => {
  let useCase: CriarDemandaUseCase;
  let repo: jest.Mocked<IDemandaRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new CriarDemandaUseCase(repo);
  });

  it('carimba o solicitante com o nome cadastrado do usuario (prioridade)', async () => {
    repo.buscarNomeUsuario.mockResolvedValue('Ana Proprietaria');
    repo.criar.mockImplementation(async (d) => d);

    await useCase.execute({
      tipo: 'RELATORIO',
      descricao: 'Preciso de um relatorio de giro por familia',
      canal: 'MANUAL',
      solicitanteUserId: 'user-1',
      solicitanteNomeFallback: 'ana@atjewel.com',
    });

    expect(repo.buscarNomeUsuario).toHaveBeenCalledWith('user-1');
    const arg = repo.criar.mock.calls[0][0] as Demanda;
    expect(arg.solicitanteNome).toBe('Ana Proprietaria');
    expect(arg.solicitanteUserId).toBe('user-1');
    expect(arg.canal).toBe('MANUAL');
    expect(arg.status).toBe('ABERTA');
  });

  it('usa o fallback (email) quando o usuario nao tem nome cadastrado', async () => {
    repo.buscarNomeUsuario.mockResolvedValue(null);
    repo.criar.mockImplementation(async (d) => d);

    await useCase.execute({
      tipo: 'AJUSTE',
      descricao: 'Ajustar o filtro de datas',
      canal: 'ASSISTENTE',
      solicitanteUserId: 'user-2',
      solicitanteNomeFallback: 'faby@atjewel.com',
    });

    const arg = repo.criar.mock.calls[0][0] as Demanda;
    expect(arg.solicitanteNome).toBe('faby@atjewel.com');
    expect(arg.canal).toBe('ASSISTENTE');
  });

  it('fixa canal ASSISTENTE quando vem do chat da Anastasia', async () => {
    repo.buscarNomeUsuario.mockResolvedValue('Ana');
    repo.criar.mockImplementation(async (d) => d);

    await useCase.execute({
      tipo: 'DUVIDA',
      descricao: 'Como interpretar o ticket medio?',
      canal: 'ASSISTENTE',
      solicitanteUserId: 'user-3',
      solicitanteNomeFallback: 'ana@atjewel.com',
    });

    const arg = repo.criar.mock.calls[0][0] as Demanda;
    expect(arg.canal).toBe('ASSISTENTE');
  });

  it('cai para rotulo generico quando nao ha nome nem fallback', async () => {
    repo.buscarNomeUsuario.mockResolvedValue(null);
    repo.criar.mockImplementation(async (d) => d);

    await useCase.execute({
      tipo: 'OUTRO',
      descricao: 'Solicitacao avulsa',
      canal: 'MANUAL',
      solicitanteUserId: null,
    });

    // Sem userId nao consulta o nome cadastrado.
    expect(repo.buscarNomeUsuario).not.toHaveBeenCalled();
    const arg = repo.criar.mock.calls[0][0] as Demanda;
    expect(arg.solicitanteNome).toBe('Usuaria');
  });

  it('rejeita descricao vazia (400) sem chamar criar', async () => {
    repo.buscarNomeUsuario.mockResolvedValue('Ana');

    await expect(
      useCase.execute({
        tipo: 'OUTRO',
        descricao: '   ',
        canal: 'MANUAL',
        solicitanteUserId: 'user-1',
        solicitanteNomeFallback: 'ana@atjewel.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.criar).not.toHaveBeenCalled();
  });
});
