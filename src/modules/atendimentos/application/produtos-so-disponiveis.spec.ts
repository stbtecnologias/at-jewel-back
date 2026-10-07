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
