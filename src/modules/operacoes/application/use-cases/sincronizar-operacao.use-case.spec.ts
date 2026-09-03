import { BadRequestException } from '@nestjs/common';
import { OperacaoEntity } from '../../domain/entities/operacao.entity';
import { IOperacaoRepository } from '../../domain/ports/repositories/operacao-repository.port';
import { SincronizarOperacaoUseCase } from './sincronizar-operacao.use-case';

function makeRepoMock(): jest.Mocked<IOperacaoRepository> {
  return {
    criar: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorIdErp: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    listar: jest.fn(),
    atualizar: jest.fn(),
  } as unknown as jest.Mocked<IOperacaoRepository>;
}

/** A operacao VENDA como ela existe depois de alguem ter classificado. */
function vendaJaClassificada(): OperacaoEntity {
  return OperacaoEntity.create({
    id: 'uuid-da-venda',
    idErp: '9000000323',
    codigoErp: 'VEN',
    nome: 'VENDA',
    classificacao: 'VENDA',
    ativo: true,
  });
}

describe('SincronizarOperacaoUseCase', () => {
  let useCase: SincronizarOperacaoUseCase;
  let repo: jest.Mocked<IOperacaoRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new SincronizarOperacaoUseCase(repo);
    repo.criar.mockImplementation(async (o) => o);
    repo.atualizar.mockImplementation(async (o) => o);
  });

  describe('criacao', () => {
    it('deve criar quando o id do ERP ainda nao existe', async () => {
      repo.buscarPorIdErp.mockResolvedValue(null);

      const { operacao, criada } = await useCase.execute({
        idErp: '009000000323',
        codigoErp: 'VEN',
        nome: 'VENDA',
      });

      expect(criada).toBe(true);
      expect(repo.criar).toHaveBeenCalledTimes(1);
      expect(operacao.nome).toBe('VENDA');
    });

    // O `Operacoes.idErpOperacoes` chega com zeros e a `Movimentacao.operacaoid`
    // sem. Se a chave nao for canonica na gravacao, a movimentacao nunca acha
    // a operacao.
    it('deve gravar o id do ERP na forma canonica, sem os zeros a esquerda', async () => {
      repo.buscarPorIdErp.mockResolvedValue(null);

      const { operacao } = await useCase.execute({
        idErp: '009000000323',
        nome: 'VENDA',
      });

      expect(repo.buscarPorIdErp).toHaveBeenCalledWith('9000000323');
      expect(operacao.idErp).toBe('9000000323');
    });

    it('deve nascer como OUTRA quando ninguem disse o que a operacao e', async () => {
      repo.buscarPorIdErp.mockResolvedValue(null);

      const { operacao } = await useCase.execute({
        idErp: '9000000999',
        codigoErp: 'TRF',
        nome: 'TRANSFERENCIA ENTRE EMPRESAS',
      });

      expect(operacao.classificacao).toBe('OUTRA');
    });

    it('deve aceitar a classificacao quando ela vem na criacao', async () => {
      repo.buscarPorIdErp.mockResolvedValue(null);

      const { operacao } = await useCase.execute({
        idErp: '9000000324',
        nome: 'DEVOLUCAO DE VENDA',
        classificacao: 'DEVOLUCAO_VENDA',
      });

      expect(operacao.classificacao).toBe('DEVOLUCAO_VENDA');
    });
  });

  describe('ressincronizacao', () => {
    it('deve atualizar em vez de criar quando o id do ERP ja existe', async () => {
      repo.buscarPorIdErp.mockResolvedValue(vendaJaClassificada());

      const { criada } = await useCase.execute({
        idErp: '9000000323',
        codigoErp: 'VEN',
        nome: 'VENDA',
      });

      expect(criada).toBe(false);
      expect(repo.criar).not.toHaveBeenCalled();
      expect(repo.atualizar).toHaveBeenCalledTimes(1);
    });

    // ESTE E O TESTE QUE IMPORTA. A classificacao e o unico campo NOSSO da
    // tabela. Se a remessa do ERP a reescrevesse, toda operacao voltaria para
    // OUTRA na proxima sincronizacao e a receita pararia de ser projetada —
    // sem erro, sem log, ate alguem fechar o mes.
    it('NAO deve deixar o ERP sobrescrever a classificacao ja definida', async () => {
      repo.buscarPorIdErp.mockResolvedValue(vendaJaClassificada());

      const { operacao } = await useCase.execute({
        idErp: '9000000323',
        nome: 'VENDA',
        classificacao: 'OUTRA',
      });

      expect(operacao.classificacao).toBe('VENDA');
    });

    it('deve atualizar nome e codigo, que sao do ERP', async () => {
      repo.buscarPorIdErp.mockResolvedValue(vendaJaClassificada());

      const { operacao } = await useCase.execute({
        idErp: '9000000323',
        codigoErp: 'VND',
        nome: 'VENDA AO CONSUMIDOR',
      });

      expect(operacao.nome).toBe('VENDA AO CONSUMIDOR');
      expect(operacao.codigoErp).toBe('VND');
      expect(operacao.id).toBe('uuid-da-venda');
    });

    it('deve manter o `ativo` atual quando o campo nao vem', async () => {
      repo.buscarPorIdErp.mockResolvedValue(
        OperacaoEntity.create({
          id: 'uuid',
          idErp: '9000000323',
          codigoErp: 'VEN',
          nome: 'VENDA',
          classificacao: 'VENDA',
          ativo: false,
        }),
      );

      const { operacao } = await useCase.execute({
        idErp: '9000000323',
        nome: 'VENDA',
      });

      expect(operacao.ativo).toBe(false);
    });
  });

  describe('recusa', () => {
    it('deve recusar sem id do ERP — sem identidade nao ha upsert', async () => {
      await expect(
        useCase.execute({ idErp: '   ', nome: 'VENDA' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.criar).not.toHaveBeenCalled();
      expect(repo.atualizar).not.toHaveBeenCalled();
    });
  });
});
