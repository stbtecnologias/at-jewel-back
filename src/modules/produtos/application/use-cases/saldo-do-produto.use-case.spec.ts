import { NotFoundException } from '@nestjs/common';
import { SaldoDoProdutoUseCase } from './saldo-do-produto.use-case';

describe('SaldoDoProdutoUseCase', () => {
  const LINHA = {
    empresa: 'AT JEWEL LTDA',
    local: 'ESTOQUE',
    grupo: 'ESTOQUE',
    quantidade: 2,
    atualizadoEm: new Date('2026-09-15T17:25:00Z'),
  };

  let repo: { findById: jest.Mock; saldoPorEmpresa: jest.Mock };
  let useCase: SaldoDoProdutoUseCase;

  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue({ id: 'p-1' }),
      saldoPorEmpresa: jest.fn().mockResolvedValue([LINHA]),
    };
    useCase = new SaldoDoProdutoUseCase(repo as never);
  });

  it('devolve as linhas de saldo da peça', async () => {
    await expect(useCase.execute('p-1')).resolves.toEqual([LINHA]);
    expect(repo.saldoPorEmpresa).toHaveBeenCalledWith('p-1');
  });

  it('peça que não existe é 404 — lista vazia seria "existe e não tem saldo"', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute('x')).rejects.toThrow(NotFoundException);
    expect(repo.saldoPorEmpresa).not.toHaveBeenCalled();
  });
});
