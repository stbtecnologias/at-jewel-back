import { NotFoundException } from '@nestjs/common';
import { Estoque } from '../../domain/entities/estoque.entity';
import { IEstoqueRepository } from '../../domain/ports/repositories/estoque-repository.port';
import { AtualizarEstoqueUseCase } from './atualizar-estoque.use-case';

/**
 * O AJUSTE DE QUANTIDADE NAO PODE APAGAR O ID DO ERP.
 *
 * Relatado pelo integrador em 15/09/2026: "atualizo o estoque e o campo
 * some". O `PATCH /estoque/:id` remontava o saldo campo a campo e esquecia o
 * `idErp` — que ninguem digita na tela, e por isso ninguem percebia.
 *
 * O ESTRAGO: e por `id_erp` que o `PUT /estoque` reconhece a linha na
 * sincronizacao. Apagado, o ERP deixa de achar o proprio registro.
 */
function makeRepoMock(): jest.Mocked<IEstoqueRepository> {
  return {
    criar: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorChave: jest.fn(),
    buscarPorIdErp: jest.fn(),
    listar: jest.fn(),
    atualizar: jest.fn(),
    remover: jest.fn(),
    upsert: jest.fn(),
  };
}

const SALDO = Estoque.create({
  id: '8bbeff4f-6193-42b4-91bd-78ab1b39e37f',
  idErp: '1387870',
  codigoErp: 'EST-01',
  empresaId: '9ee6f101-31c7-4152-955c-c692972bd196',
  grupoEstoqueId: 'd50433dd-dcbe-46f9-89ce-f908423a4244',
  produtoId: 'e0f2daf9-6c27-4b2c-98b2-90a4f082172c',
  localEstoqueId: 'dd334e1c-f013-4353-aba1-95f87a08d2ce',
  quantidade: 3,
});

describe('AtualizarEstoqueUseCase', () => {
  let repo: jest.Mocked<IEstoqueRepository>;
  let useCase: AtualizarEstoqueUseCase;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new AtualizarEstoqueUseCase(repo);
    repo.buscarPorId.mockResolvedValue(SALDO);
    repo.atualizar.mockImplementation((e) => Promise.resolve(e));
  });

  it('o ajuste de quantidade PRESERVA o id do ERP', async () => {
    await useCase.execute(SALDO.id!, { quantidade: 0 });

    const gravado = repo.atualizar.mock.calls[0][0];
    expect(gravado.idErp).toBe('1387870');
    expect(gravado.quantidade).toBe(0);
  });

  it('preserva tambem o codigo e as quatro dimensoes do saldo', async () => {
    // Empresa, grupo, produto e local sao a IDENTIDADE do saldo: o ajuste
    // muda a quantidade e mais nada.
    await useCase.execute(SALDO.id!, { quantidade: 7 });

    const gravado = repo.atualizar.mock.calls[0][0];
    expect(gravado.codigoErp).toBe('EST-01');
    expect(gravado.empresaId).toBe(SALDO.empresaId);
    expect(gravado.grupoEstoqueId).toBe(SALDO.grupoEstoqueId);
    expect(gravado.produtoId).toBe(SALDO.produtoId);
    expect(gravado.localEstoqueId).toBe(SALDO.localEstoqueId);
    expect(gravado.id).toBe(SALDO.id);
  });

  it('saldo que nao existe da 404, e nao grava nada', async () => {
    repo.buscarPorId.mockResolvedValue(null);

    await expect(
      useCase.execute('nao-existe', { quantidade: 1 }),
    ).rejects.toThrow(NotFoundException);
    expect(repo.atualizar.mock.calls).toHaveLength(0);
  });

  it('saldo SEM id do ERP continua sem — nao inventa valor', async () => {
    // Linha criada pela tela, que nunca teve id do ERP: o ajuste nao pode
    // preencher nada.
    repo.buscarPorId.mockResolvedValue(
      Estoque.create({
        id: SALDO.id,
        idErp: null,
        codigoErp: SALDO.codigoErp,
        empresaId: SALDO.empresaId,
        grupoEstoqueId: SALDO.grupoEstoqueId,
        produtoId: SALDO.produtoId,
        localEstoqueId: SALDO.localEstoqueId,
        quantidade: SALDO.quantidade,
      }),
    );

    await useCase.execute(SALDO.id!, { quantidade: 1 });

    expect(repo.atualizar.mock.calls[0][0].idErp).toBeNull();
  });
});
