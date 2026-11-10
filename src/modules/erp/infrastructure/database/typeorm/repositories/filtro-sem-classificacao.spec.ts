import { ProdutoRepository } from './produto.repository';
import { SEM_CLASSIFICACAO } from '../../../../domain/ports/repositories/produto-repository.port';

/**
 * ==========================================================================
 * FILTRAR AS PECAS SEM CLASSIFICACAO — 10/11/2026.
 *
 * Desde hoje `categoria` e `familia` podem chegar vazias: o ERP tem pecas sem
 * classificacao, e recusa-las (75 num lote so) nao preenchia nada — so as
 * mantinha fora da base.
 *
 * Entrando, elas precisam poder ser ENCONTRADAS. Sem isso o Yerlon nao tem
 * como saber quais pecas faltam cadastrar do lado dele, e o vazio vira sujeira
 * silenciosa em vez de uma lista de trabalho.
 *
 * ==========================================================================
 * POR QUE UM SENTINELA, E NAO A PROPRIA STRING VAZIA.
 *
 * O filtro do repositorio ja aceitaria `''` — ele testa `!== undefined`, e nao
 * a verdade do valor. Mas o VALOR VAZIO NAO CHEGA ATE AQUI: o front monta a
 * query descartando vazio (`v !== ''` em `lib/api/produtos.ts`), entao
 * `categoria=''` sumiria no caminho e a tela mostraria tudo.
 *
 * Mudar aquela linha afetaria TODOS os filtros da tela de produtos. Um
 * sentinela afeta um.
 * ==========================================================================
 */
describe('o filtro das pecas sem categoria ou sem familia', () => {
  let andWhere: jest.Mock;
  let repo: ProdutoRepository;

  beforeEach(() => {
    andWhere = jest.fn(() => qb);
    const qb: Record<string, jest.Mock> = {
      andWhere,
      getCount: jest.fn().mockResolvedValue(0),
    };
    const orm = {
      createQueryBuilder: jest.fn(() => qb),
      manager: { query: jest.fn().mockResolvedValue([]) },
    };
    repo = new ProdutoRepository(orm as never);
  });

  /** As condicoes que o repositorio pediu, como texto. */
  const condicoes = () => andWhere.mock.calls.map((c) => String(c[0]));

  /* ESTE E O TESTE. */
  it('o sentinela de categoria vira "igual a vazio", e nao busca pelo texto dele', async () => {
    await repo.contar({ categoria: SEM_CLASSIFICACAO });

    expect(condicoes().join(' ')).toContain("p.categoria = ''");
    // O sentinela NAO pode viajar como valor: viraria busca pela peca cuja
    // categoria e literalmente "__SEM__", que nao existe.
    const valores = andWhere.mock.calls.map((c) => JSON.stringify(c[1] ?? {}));
    expect(valores.join(' ')).not.toContain(SEM_CLASSIFICACAO);
  });

  it('e o mesmo vale para a familia', async () => {
    await repo.contar({ familia: SEM_CLASSIFICACAO });

    expect(condicoes().join(' ')).toContain("p.familia = ''");
  });

  /* O FILTRO NORMAL NAO MUDA — 7.423 pecas dependem dele. */
  it('uma categoria de verdade continua indo como parametro', async () => {
    await repo.contar({ categoria: 'JEWEL' });

    expect(condicoes().join(' ')).toContain('p.categoria = :categoria');
    expect(andWhere.mock.calls[0][1]).toEqual({ categoria: 'JEWEL' });
  });

  it('sem filtro de categoria, nenhuma condicao de categoria e pedida', async () => {
    await repo.contar({});

    expect(condicoes().join(' ')).not.toContain('p.categoria');
  });
});
