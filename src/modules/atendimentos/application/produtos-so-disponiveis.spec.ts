import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { ConsultarProdutosVendedoraUseCase } from './use-cases/consultar-produtos-vendedora.use-case';

/**
 * A Conexa que nunca tem a foto — que e o caso comum: das 320 joias com
 * saldo, 55 tem foto (17%). Quem testa recorte nao testa foto.
 */
const SEM_FOTOS = {
  buscar: async () => ({ fotos: [], tinhamUrl: 0, cortadas: 0 }),
} as never;

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
    const uc = new ConsultarProdutosVendedoraUseCase(listar.uso as never, SEM_FOTOS);

    await uc.execute('anel de esmeralda');

    expect(listar.filtros[0]).toMatchObject({ apenasDisponiveis: true });
  });

  /* ESTE É O TESTE. O resto é contorno. */
  it('quando ela pede o indisponível, o filtro sai', async () => {
    const listar = listarQueAnota();
    const uc = new ConsultarProdutosVendedoraUseCase(listar.uso as never, SEM_FOTOS);

    await uc.execute('anel de esmeralda', { incluirSemEstoque: true });

    expect(listar.filtros[0]).toMatchObject({ apenasDisponiveis: false });
  });
});

describe('o padrão é só o disponível — canal da gestão', () => {
  function servico() {
    const listar = listarQueAnota();
    const deps = Array.from({ length: 22 }, (_, i) =>
      naoParaTudo(`colaborador ${i}`),
    );
    // O `ListarProdutosUseCase` é o décimo do construtor; ver a classe,
    // e o serviço de fotos entrou logo depois dele em 07/10.
    deps[9] = listar.uso as never;
    deps[10] = SEM_FOTOS;
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
      SEM_FOTOS,
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
      SEM_FOTOS,
    );

    const r = await uc.execute('esmeralda', { incluirSemEstoque: true });

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
    } as never, SEM_FOTOS);

    const r = await uc.execute('esmeralda');

    expect(r.semEstoque).toBe(0);
  });
});

/**
 * ==========================================================================
 * O PADRÃO JOIA, E O NÚMERO DO QUE ELE ESCONDE — 07/10/2026.
 *
 * O recorte por categoria tem o mesmo risco do teto: sumir com peça sem
 * dizer que sumiu. Por isso ele vem acompanhado do `foraDaCategoria`.
 * ==========================================================================
 */
describe('a categoria da pergunta', () => {
  /** Os números reais da esmeralda: 9 com saldo, 2 delas JEWEL. */
  function listarPorCategoria() {
    const filtros: Record<string, unknown>[] = [];
    return {
      filtros,
      uso: {
        execute: async (f: Record<string, unknown>) => {
          filtros.push(f);
          return [];
        },
        contar: async (f: { categoriaSugerida?: string }) =>
          f.categoriaSugerida ? 2 : 9,
      },
    };
  }

  it('sem pedir nada, a consulta vai recortada em joia', async () => {
    const listar = listarPorCategoria();
    const uc = new ConsultarProdutosVendedoraUseCase(listar.uso as never, SEM_FOTOS);

    const r = await uc.execute('esmeralda');

    expect(listar.filtros[0]).toMatchObject({ categoriaSugerida: 'JEWEL' });
    expect(r.categoria).toBe('JEWEL');
  });

  /* ESTE É O TESTE. O resto é contorno. */
  it('conta quantas a categoria escondeu', async () => {
    const listar = listarPorCategoria();
    const uc = new ConsultarProdutosVendedoraUseCase(listar.uso as never, SEM_FOTOS);

    const r = await uc.execute('esmeralda');

    // 9 casam com o termo, 2 são joia: 7 ficaram de fora — as peças de casa.
    expect(r.total).toBe(2);
    expect(r.foraDaCategoria).toBe(7);
  });

  it('TODAS desliga o recorte, e aí não há o que esconder', async () => {
    const listar = listarPorCategoria();
    const uc = new ConsultarProdutosVendedoraUseCase(listar.uso as never, SEM_FOTOS);

    const r = await uc.execute('esmeralda', { categoria: 'TODAS' });

    expect(listar.filtros[0].categoriaSugerida).toBeUndefined();
    expect(r.categoria).toBeUndefined();
    expect(r.foraDaCategoria).toBe(0);
  });

  it('a categoria pedida chega ao filtro', async () => {
    const listar = listarPorCategoria();
    const uc = new ConsultarProdutosVendedoraUseCase(listar.uso as never, SEM_FOTOS);

    await uc.execute('vaso', { categoria: 'HOME' });

    expect(listar.filtros[0]).toMatchObject({ categoriaSugerida: 'HOME' });
  });
});

/**
 * ==========================================================================
 * A FAIXA E A PÁGINA — 07/10/2026.
 *
 * *"Quer que eu traga as 3 restantes?" — "A busca só me devolve essas 6
 * primeiras de cada vez."* Era verdade, e inútil.
 * ==========================================================================
 */
describe('a faixa de preço e a continuação da lista', () => {
  function listarQueAnota2() {
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

  it('a faixa chega ao filtro, lida do texto', async () => {
    const listar = listarQueAnota2();
    const uc = new ConsultarProdutosVendedoraUseCase(listar.uso as never, SEM_FOTOS);

    await uc.execute('colar', { precoAte: '20.000' });

    expect(listar.filtros[0]).toMatchObject({ precoAte: 20000 });
  });

  /* ESTE É O TESTE. O resto é contorno. */
  it('a página seguinte vira deslocamento', async () => {
    const listar = listarQueAnota2();
    const uc = new ConsultarProdutosVendedoraUseCase(listar.uso as never, SEM_FOTOS);

    const r = await uc.execute('colar', { aPartirDe: 20 });

    expect(listar.filtros[0]).toMatchObject({ deslocamento: 20 });
    expect(r.pulados).toBe(20);
  });

  it('o teto da lista é 10 — nem 6, nem 20', async () => {
    const listar = listarQueAnota2();
    const uc = new ConsultarProdutosVendedoraUseCase(listar.uso as never, SEM_FOTOS);

    await uc.execute('colar');

    expect(listar.filtros[0]).toMatchObject({ limit: 10 });
  });

  it('página negativa não anda para trás', async () => {
    const listar = listarQueAnota2();
    const uc = new ConsultarProdutosVendedoraUseCase(listar.uso as never, SEM_FOTOS);

    const r = await uc.execute('colar', { aPartirDe: -10 });

    expect(r.pulados).toBe(0);
  });
});
