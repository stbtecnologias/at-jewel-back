import { Produto } from '../../../../domain/entities/produto.entity';
import { ProdutoRepository } from './produto.repository';

/**
 * O EVENTO DO ERP NAO APAGA O QUE NAO MANDA — 11/09/2026.
 *
 * O `upsertByCodigoErp` era `repo.upsert(this.toOrm(produto))`. O evento de
 * produto do ERP nao traz `idErp`, estoque nem data de entrada; o `Produto`
 * chegava com `null`, `0` e `null`, e o TypeORM 1.0.0 reescreve no conflito
 * toda coluna que nao seja `undefined`.
 *
 * Reproduzido no banco local, pela rota `/erp/produtos`, antes do conserto:
 * UM evento tirou o `idErp` da peca, zerou o estoque e apagou a data de
 * entrada. Depois do conserto, o mesmo evento manteve os tres, gravou o que o
 * ERP mandou, e a peca nova nasceu com a data de hoje.
 *
 * Estes testes olham o que o repositorio PEDE ao banco: a lista de colunas do
 * `ON CONFLICT` e os valores do INSERT.
 */
describe('ProdutoRepository.upsertByCodigoErp — o que o ERP reescreve', () => {
  let values: jest.Mock;
  let orUpdate: jest.Mock;
  let query: jest.Mock;
  let repo: ProdutoRepository;

  // snake_case como no banco — o bastante para o teste ler a lista.
  const paraColuna = (propriedade: string) =>
    propriedade.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);

  beforeEach(() => {
    const qb: Record<string, jest.Mock> = {};
    values = jest.fn(() => qb);
    orUpdate = jest.fn(() => qb);
    qb.insert = jest.fn(() => qb);
    qb.into = jest.fn(() => qb);
    qb.values = values;
    qb.orUpdate = orUpdate;
    qb.execute = jest.fn().mockResolvedValue(undefined);

    // O saldo vem da tabela `estoque` (17/09/2026): 5 aqui, e NAO o 3 da
    // coluna aposentada que a linha do banco ainda carrega.
    query = jest.fn().mockResolvedValue([
      {
        produto_id: 'p-1',
        empresa: 'AT HOME LTDA',
        local: 'ESTOQUE',
        grupo: 'ESTOQUE',
        quantidade: 3,
      },
      {
        produto_id: 'p-1',
        empresa: 'MP COMERCIO',
        local: 'ESTOQUE',
        grupo: 'ESTOQUE',
        quantidade: 2,
      },
      {
        produto_id: 'p-1',
        empresa: 'GOLDESIGN',
        local: 'ESTOQUE',
        grupo: 'ESTOQUE',
        quantidade: 0,
      },
    ]);

    const ormRepo = {
      manager: { query },
      metadata: {
        findColumnWithPropertyName: (p: string) => ({
          databaseName: paraColuna(p),
        }),
      },
      createQueryBuilder: jest.fn(() => qb),
      findOneByOrFail: jest.fn().mockResolvedValue({
        id: 'p-1',
        codigoErp: 'CO26185',
        categoria: 'Colar',
        familia: 'Ouro 18k',
        unidade: 'un',
        valorVenda: '43920',
        ativo: true,
        estoqueAtual: 3,
        dataEntradaEstoque: new Date('2026-01-02'),
        idErp: 'ERP-1',
      }),
    };
    repo = new ProdutoRepository(ormRepo as never);
  });

  // O que o `AtualizarProdutoViaErpUseCase` monta: sem idErp, estoque e data.
  const doEvento = () =>
    Produto.create({
      codigoErp: 'CO26185',
      categoria: 'Colar',
      familia: 'Ouro 18k',
      unidade: 'un',
      valorVenda: 43920,
      ativo: true,
    });

  function colunasReescritas(): string[] {
    const [colunas] = orUpdate.mock.calls[0] as [string[]];
    return colunas;
  }

  it('o ON CONFLICT NAO reescreve idErp, estoque nem data de entrada', async () => {
    await repo.upsertByCodigoErp(doEvento());

    const colunas = colunasReescritas();
    expect(colunas).not.toContain('id_erp');
    expect(colunas).not.toContain('estoque_atual');
    expect(colunas).not.toContain('data_entrada_estoque');
    // A chave do conflito tambem nao se reescreve.
    expect(colunas).not.toContain('codigo_erp');
  });

  it('o que o ERP manda continua sendo reescrito', async () => {
    await repo.upsertByCodigoErp(doEvento());

    const colunas = colunasReescritas();
    for (const c of [
      'categoria',
      'familia',
      'valor_venda',
      'ativo',
      'observacao',
    ]) {
      expect(colunas).toContain(c);
    }
    // E a foto propria da loja segue fora, como ja era — ver `toOrm`.
    expect(colunas).not.toContain('foto_arquivo_id');
  });

  it('o conflito e pelo codigo do ERP, e so grava se algo mudou', async () => {
    await repo.upsertByCodigoErp(doEvento());

    const [, conflito, opcoes] = orUpdate.mock.calls[0] as [
      string[],
      string[],
      { skipUpdateIfNoValuesChanged: boolean },
    ];
    expect(conflito).toEqual(['codigo_erp']);
    expect(opcoes.skipUpdateIfNoValuesChanged).toBe(true);
  });

  it('o INSERT nao leva estoque — a coluna foi aposentada', async () => {
    await repo.upsertByCodigoErp(doEvento());

    const [linha] = values.mock.calls[0] as [Record<string, unknown>];
    expect(linha).not.toHaveProperty('estoqueAtual');
  });

  it('o saldo devolvido e a SOMA da tabela estoque, nao a coluna', async () => {
    const produto = await repo.upsertByCodigoErp(doEvento());

    expect(produto.estoqueAtual).toBe(5);
    // As posicoes vem junto, INCLUSIVE a zerada: filtrar por GOLDESIGN tem
    // de achar a peca que existe la com zero.
    expect(produto.posicoes.map((p) => p.empresa)).toEqual([
      'AT HOME LTDA',
      'MP COMERCIO',
      'GOLDESIGN',
    ]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM estoque');
    expect(params).toEqual([['p-1']]);
  });

  it('peca sem linha de estoque tem saldo zero', async () => {
    query.mockResolvedValue([]);

    const produto = await repo.upsertByCodigoErp(doEvento());

    expect(produto.estoqueAtual).toBe(0);
    expect(produto.posicoes).toEqual([]);
  });

  it('peca NOVA nasce com a data de entrada de agora', async () => {
    await repo.upsertByCodigoErp(doEvento());

    const [linha] = values.mock.calls[0] as [
      { dataEntradaEstoque: () => string },
    ];
    // Funcao = SQL cru no INSERT. Como a coluna nao esta na lista do
    // conflito, isto so vale para a peca que ainda nao existia.
    expect(typeof linha.dataEntradaEstoque).toBe('function');
    expect(linha.dataEntradaEstoque()).toBe('now()');
  });
});
