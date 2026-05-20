import { AtualizarProdutoViaErpUseCase } from './atualizar-produto-via-erp.use-case';
import { IProdutoRepository } from '../../domain/ports/repositories/produto-repository.port';
import { IErpEventoRepository } from '../../domain/ports/repositories/erp-evento-repository.port';
import { Produto } from '../../domain/entities/produto.entity';

const mockProduto = Produto.create({
  id: 'uuid-123',
  codigoErp: 'PROD-001',
  categoria: 'JEWEL',
  familia: 'Anel',
  unidade: 'UN',
  valorVenda: 1500,
  ativo: true,
});

const produtoRepo: jest.Mocked<IProdutoRepository> = {
  upsertByCodigoErp: jest.fn().mockResolvedValue(mockProduto),
  findByCodigoErp: jest.fn(),
};

const eventoRepo: jest.Mocked<IErpEventoRepository> = {
  jaProcessado: jest.fn(),
  marcarComoProcessado: jest.fn().mockResolvedValue(undefined),
};

const input = {
  eventoId: '550e8400-e29b-41d4-a716-446655440000',
  codigoErp: 'PROD-001',
  categoria: 'JEWEL',
  familia: 'Anel',
  unidade: 'UN',
  valorVenda: 1500,
};

describe('AtualizarProdutoViaErpUseCase', () => {
  let useCase: AtualizarProdutoViaErpUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new AtualizarProdutoViaErpUseCase(produtoRepo, eventoRepo);
  });

  it('persiste produto e marca evento quando evento é novo', async () => {
    eventoRepo.jaProcessado.mockResolvedValue(false);

    const result = await useCase.execute(input);

    expect(result.idempotente).toBe(false);
    expect(result.produto).toBeDefined();
    expect(produtoRepo.upsertByCodigoErp).toHaveBeenCalledTimes(1);
    expect(eventoRepo.marcarComoProcessado).toHaveBeenCalledWith(
      input.eventoId,
      'PRODUTO',
    );
  });

  it('retorna idempotente:true e não persiste quando evento já foi processado', async () => {
    eventoRepo.jaProcessado.mockResolvedValue(true);

    const result = await useCase.execute(input);

    expect(result.idempotente).toBe(true);
    expect(result.produto).toBeUndefined();
    expect(produtoRepo.upsertByCodigoErp).not.toHaveBeenCalled();
    expect(eventoRepo.marcarComoProcessado).not.toHaveBeenCalled();
  });
});
