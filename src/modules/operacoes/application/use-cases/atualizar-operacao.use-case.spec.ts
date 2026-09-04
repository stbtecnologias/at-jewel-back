import { ConflictException, NotFoundException } from '@nestjs/common';
import { OperacaoEntity } from '../../domain/entities/operacao.entity';
import { IOperacaoRepository } from '../../domain/ports/repositories/operacao-repository.port';
import { AtualizarOperacaoUseCase } from './atualizar-operacao.use-case';

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

/** A VEN como ela nasce da sincronizacao: sem ninguem ter dito o que e. */
function vendaComoOutra(): OperacaoEntity {
  return OperacaoEntity.create({
    id: '1163afd4-b1cb-4a06-9286-5090f1f60334',
    idErp: '9000000323',
    codigoErp: 'VEN',
    nome: 'VENDA',
    classificacao: 'OUTRA',
    ativo: true,
  });
}

describe('AtualizarOperacaoUseCase', () => {
  let useCase: AtualizarOperacaoUseCase;
  let repo: jest.Mocked<IOperacaoRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new AtualizarOperacaoUseCase(repo);
    repo.atualizar.mockImplementation(async (o) => o);
    repo.buscarPorId.mockResolvedValue(vendaComoOutra());
  });

  describe('classificar — a razao de ser deste PATCH', () => {
    // O caso real: a operacao chega do ERP como OUTRA e alguem diz o que ela e.
    it('deve trocar OUTRA por VENDA quando so a classificacao vem no corpo', async () => {
      const r = await useCase.execute('1163afd4-b1cb-4a06-9286-5090f1f60334', {
        classificacao: 'VENDA',
      });

      expect(r.classificacao).toBe('VENDA');
      expect(repo.atualizar).toHaveBeenCalledTimes(1);
      expect(repo.atualizar.mock.calls[0][0].classificacao).toBe('VENDA');
    });

    // O corpo inteiro do PUT reenviado como PATCH tambem tem de funcionar — e
    // um erro facil de cometer, e o `forbidNonWhitelisted` do ValidationPipe
    // recusaria qualquer campo estranho antes de chegar aqui.
    it('deve classificar mesmo recebendo os outros campos junto', async () => {
      const r = await useCase.execute('1163afd4-b1cb-4a06-9286-5090f1f60334', {
        idErp: '009000000323',
        codigoErp: 'VEN',
        nome: 'VENDA',
        classificacao: 'DEVOLUCAO_VENDA',
      });

      expect(r.classificacao).toBe('DEVOLUCAO_VENDA');
      // E o idErp continua canonico, nao volta a ter os zeros.
      expect(r.idErp).toBe('9000000323');
    });

    it('deve preservar o que nao veio no corpo', async () => {
      const r = await useCase.execute('1163afd4-b1cb-4a06-9286-5090f1f60334', {
        classificacao: 'VENDA',
      });

      expect(r.idErp).toBe('9000000323');
      expect(r.codigoErp).toBe('VEN');
      expect(r.nome).toBe('VENDA');
      expect(r.ativo).toBe(true);
      expect(r.id).toBe('1163afd4-b1cb-4a06-9286-5090f1f60334');
    });
  });

  describe('recusa', () => {
    it('deve devolver 404 para id que nao existe', async () => {
      repo.buscarPorId.mockResolvedValue(null);

      await expect(
        useCase.execute('11111111-1111-1111-1111-111111111111', {
          classificacao: 'VENDA',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.atualizar).not.toHaveBeenCalled();
    });

    it('deve recusar id do ERP que ja e de outra operacao', async () => {
      repo.buscarPorIdErp.mockResolvedValue(
        OperacaoEntity.create({
          id: 'outra-uuid',
          idErp: '9000000324',
          codigoErp: 'DVE',
          nome: 'DEVOLUCAO DE VENDA',
          classificacao: 'DEVOLUCAO_VENDA',
          ativo: true,
        }),
      );

      await expect(
        useCase.execute('1163afd4-b1cb-4a06-9286-5090f1f60334', {
          idErp: '9000000324',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
