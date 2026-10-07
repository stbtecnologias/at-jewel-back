import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { ConsultarProdutosVendedoraUseCase } from './use-cases/consultar-produtos-vendedora.use-case';

/**
 * ==========================================================================
 * A REGRA DE 07/10/2026, NOS DOIS CANAIS.
 *
 * "Só lista os disponíveis. Mas se ela perguntar se tem algum sem estoque ou
 * indisponíveis, aí você também pode falar — só se perguntar." — Lucas.
 *
 * O filtro em si é testado em `so-o-disponivel.spec.ts`, no repositório.
 * Aqui se guarda o PADRÃO: quem não pede nada recebe só o que dá para
 * vender, e nas duas pontas — a vendedora na Helena e a gestão na Anastasia.
 *
 * Duas ferramentas com o mesmo nome e handlers diferentes já divergiram
 * antes (a quantidade, em 25/09). Por isso as duas são testadas no mesmo
 * arquivo: uma regra que vale para as duas tem de cair junto quando quebra.
 * ==========================================================================
 */

/** Anota o filtro que chegou ao `ListarProdutosUseCase` e devolve vazio. */
function listarQueAnota() {
  const filtros: Record<string, unknown>[] = [];
  return {
    filtros,
    uso: {
      execute: async (f: Record<string, unknown>) => {
        filtros.push(f);
        return [];
      },
      contar: async () => 0,
    },
  };
}

/** Qualquer colaborador que este teste não toca. Tocar nele estoura. */
function naoParaTudo(nome: string) {
  return new Proxy(
    {},
    {
      get: () => {
        throw new Error(`o teste encostou em ${nome}, e não devia`);
      },
    },
  );
}

describe('o padrão é só o disponível — canal da vendedora', () => {
  it('sem pedir nada, a consulta vai filtrada', async () => {
    const listar = listarQueAnota();
    const uc = new ConsultarProdutosVendedoraUseCase(listar.uso as never);

    await uc.execute('anel de esmeralda');

    expect(listar.filtros[0]).toMatchObject({ apenasDisponiveis: true });
  });

  /* ESTE É O TESTE. O resto é contorno. */
  it('quando ela pede o indisponível, o filtro sai', async () => {
    const listar = listarQueAnota();
    const uc = new ConsultarProdutosVendedoraUseCase(listar.uso as never);

    await uc.execute('anel de esmeralda', true);

    expect(listar.filtros[0]).toMatchObject({ apenasDisponiveis: false });
  });
});

describe('o padrão é só o disponível — canal da gestão', () => {
  function servico() {
    const listar = listarQueAnota();
    const deps = Array.from({ length: 22 }, (_, i) =>
      naoParaTudo(`colaborador ${i}`),
    );
    // O `ListarProdutosUseCase` é o décimo do construtor; ver a classe.
    deps[9] = listar.uso as never;
    const svc = new FerramentasGestaoService(
      ...(deps as unknown as ConstructorParameters<
        typeof FerramentasGestaoService
      >),
    );
    return { svc, listar };
  }

  it('sem pedir nada, a consulta vai filtrada', async () => {
    const { svc, listar } = servico();

    await svc.montar({}).gestaoProdutos({ busca: 'anel de esmeralda' });

    expect(listar.filtros[0]).toMatchObject({ apenasDisponiveis: true });
  });

  it('quando ela pede o indisponível, o filtro sai', async () => {
    const { svc, listar } = servico();

    await svc.montar({}).gestaoProdutos({
      busca: 'anel de esmeralda',
      incluirSemEstoque: true,
    });

    expect(listar.filtros[0]).toMatchObject({ apenasDisponiveis: false });
  });
});

/**
 * ==========================================================================
 * AMOSTRA + TOTAL, E O QUE FICOU DE FORA — 07/10/2026.
 *
 * O `semEstoque` é uma SUBTRAÇÃO entre duas contagens: quantas existem no
 * catálogo e quantas têm saldo. Trocar a ordem dá um número negativo, e um
 * negativo aqui vira "outras -103 estão sem estoque" na boca da agente.
 * ==========================================================================
 */
describe('o número do que ficou de fora', () => {
  /** 9 com saldo, 112 no catálogo — os números reais da esmeralda. */
  function listarComDoisTotais() {
    return {
      execute: async () => [],
      contar: async (f: { apenasDisponiveis?: boolean }) =>
        f.apenasDisponiveis ? 9 : 112,
    };
  }

  it('conta as que o filtro deixou de fora', async () => {
    const uc = new ConsultarProdutosVendedoraUseCase(
      listarComDoisTotais() as never,
    );

    const r = await uc.execute('esmeralda');

    expect(r.total).toBe(9);
    expect(r.semEstoque).toBe(103);
  });

  /**
   * ESTE É O TESTE DA SEGUNDA RODADA, 07/10.
   *
   * Zerar o `semEstoque` quando ela pede o indisponível parecia óbvio — "não
   * ficou nada de fora" — e tirava o número justamente da pergunta que era
   * sobre ele: *"tem alguma esmeralda sem estoque?"*. A agente respondeu que
   * não dava para afirmar. São 103.
   */
  it('com o indisponível ligado, o número das zeradas continua vindo', async () => {
    const uc = new ConsultarProdutosVendedoraUseCase(
      listarComDoisTotais() as never,
    );

    const r = await uc.execute('esmeralda', true);

    expect(r.total).toBe(112);
    expect(r.semEstoque).toBe(103);
    expect(r.incluiuSemEstoque).toBe(true);
  });

  /**
   * Defesa contra a leitura suja: se a contagem sem filtro vier MENOR que a
   * com filtro — corrida, cache, qualquer coisa —, o resultado não pode ser
   * negativo.
   */
  it('nunca devolve número negativo', async () => {
    const uc = new ConsultarProdutosVendedoraUseCase({
      execute: async () => [],
      contar: async (f: { apenasDisponiveis?: boolean }) =>
        f.apenasDisponiveis ? 50 : 10,
    } as never);

    const r = await uc.execute('esmeralda');

    expect(r.semEstoque).toBe(0);
  });
});
