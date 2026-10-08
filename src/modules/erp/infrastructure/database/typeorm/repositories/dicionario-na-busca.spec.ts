import { Brackets } from 'typeorm';
import { ProdutoRepository } from './produto.repository';

/**
 * ==========================================================================
 * RF6 e RF7 — A PALAVRA DELA, A SIGLA DO CATÁLOGO. 08/10/2026.
 *
 * Medido na base: "brinco de diamante" achava ZERO peças com estoque, e a
 * loja tem 74 brincos de diamante para vender. A causa não era a busca —
 * `DTS` e `DMT` não são a palavra "diamante".
 *
 * O `sinonimos.spec.ts` prova a TABELA. Aqui se prova que ela chega na
 * CONSULTA, e sobretudo COMO: a palavra em português por substring, a sigla
 * por PALAVRA INTEIRA.
 *
 * ESSA DIFERENÇA É O ARQUIVO INTEIRO. Trocar o `~*` da sigla por um ILIKE
 * não quebra nada que dê erro: a consulta continua válida, todos os outros
 * testes passam, e `ON` (ouro negro) passa a casar 4.682 peças em vez de 63
 * — porque pega cONjunto, cONcha e ONÇA. A busca não falha; ela devolve o
 * catálogo inteiro com cara de resposta.
 * ==========================================================================
 */

type No = { condicao: string; parametros: unknown[]; filhos: No[] };

/**
 * Um `QueryBuilder` que não fala com banco nenhum e anota condição, nível **e
 * parâmetro**. O parâmetro é o que importa aqui: é nele que mora o `\m...\M`.
 */
function construtorQueAnota() {
  const raiz: No = { condicao: 'RAIZ', parametros: [], filhos: [] };

  const construir = (no: No) => {
    const anotar = (condicao: unknown, parametros?: unknown) => {
      if (condicao instanceof Brackets) {
        const grupo: No = { condicao: 'GRUPO', parametros: [], filhos: [] };
        no.filhos.push(grupo);
        condicao.whereFactory(construir(grupo) as never);
      } else {
        no.filhos.push({
          condicao: String(condicao),
          parametros: Object.values(parametros ?? {}),
          filhos: [],
        });
      }
      return qb;
    };
    const qb = {
      where: anotar,
      andWhere: anotar,
      orWhere: anotar,
      orderBy: () => qb,
      addOrderBy: () => qb,
      skip: () => qb,
      take: () => qb,
      getMany: async () => [],
    };
    return qb;
  };

  return { qb: construir(raiz), raiz };
}

function repositorioFalso() {
  const { qb, raiz } = construtorQueAnota();
  const repo = new ProdutoRepository({
    createQueryBuilder: () => qb,
    manager: { query: async () => [] },
  } as never);
  return { repo, raiz };
}

/** Todos os nós da árvore, sem olhar nível. */
function todosOsNos(no: No): No[] {
  return [no, ...no.filhos.flatMap(todosOsNos)];
}

/** Todos os valores de parâmetro que a consulta leva. */
function parametros(no: No): string[] {
  return todosOsNos(no).flatMap((n) => n.parametros.map(String));
}

/** Todos os grupos de parênteses da consulta. */
function grupos(no: No): No[] {
  return todosOsNos(no).filter((n) => n.filhos.length > 0);
}

/** Se este grupo leva, em qualquer nível abaixo dele, este parâmetro. */
function leva(grupo: No, valor: string): boolean {
  return parametros(grupo).includes(valor);
}

const FRONTEIRA_DE_PALAVRA = /^\\m.+\\M$/;

describe('a busca com dicionário — RF6', () => {
  /* ESTE É O TESTE. O resto é contorno. */
  it('"diamante" leva as duas grafias do catálogo para o banco', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({ busca: 'brinco de diamante', ativo: true });

    const valores = parametros(raiz);
    expect(valores).toContain('%brinco%');
    expect(valores).toContain('%diamante%');
    expect(valores).toContain('\\mDTS\\M');
    expect(valores).toContain('\\mDMT\\M');
  });

  /**
   * O teste que falha EM SILÊNCIO se alguém "simplificar" a sigla para ILIKE.
   * A palavra em português tem de continuar por substring — "esmeralda" acha
   * "ANEL VINTAGE ESMERALDA GOTA" — e a sigla, nunca.
   */
  it('a sigla casa por palavra inteira; a palavra, por substring', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({ busca: 'esmeralda', ativo: true });

    const porRegex = todosOsNos(raiz).filter((n) => n.condicao.includes('~*'));
    const porLike = todosOsNos(raiz).filter((n) => n.condicao.includes('ILIKE'));

    expect(porRegex.length).toBeGreaterThan(0);
    expect(porLike.length).toBeGreaterThan(0);

    // Toda sigla vai com fronteira de palavra, e nenhuma com porcento.
    for (const no of porRegex) {
      for (const valor of no.parametros.map(String)) {
        expect(valor).toMatch(FRONTEIRA_DE_PALAVRA);
        expect(valor).not.toContain('%');
      }
    }
    // E toda palavra continua por substring.
    for (const no of porLike) {
      for (const valor of no.parametros.map(String)) {
        expect(valor).toContain('%');
      }
    }
  });

  it('palavra sem sigla não inventa condição nenhuma', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({ busca: 'colar vintage', ativo: true });

    expect(todosOsNos(raiz).some((n) => n.condicao.includes('~*'))).toBe(false);
  });
});

describe('a busca com dicionário — RF7, o metal', () => {
  /**
   * `OA 18K` não contém "ouro" NEM "amarelo". Quebrada em duas palavras
   * ligadas por E, a busca acha zero — e é o que ela fazia. As duas têm de
   * entrar no MESMO grupo, com a sigla do outro lado do OU.
   */
  it('"ouro amarelo" e OA ficam no mesmo grupo', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({ busca: 'anel de ouro amarelo', ativo: true });

    // Existe UM grupo que junta as duas palavras com a sigla — e que deixa o
    // "anel" de fora. O "anel" é outra exigência, ligada por E: se caísse
    // dentro deste grupo, entraria como ALTERNATIVA de OA, e a busca traria
    // todo anel do catálogo.
    // O MENOR grupo que junta os três — o de fora junta tudo, inclusive o
    // "anel", e passaria mesmo com a expressão quebrada em duas palavras.
    const [grupoDoMetal] = grupos(raiz)
      .filter(
        (g) => leva(g, '%ouro%') && leva(g, '%amarelo%') && leva(g, '\\mOA\\M'),
      )
      .sort((a, b) => parametros(a).length - parametros(b).length);

    expect(grupoDoMetal).toBeDefined();
    expect(leva(grupoDoMetal, '%anel%')).toBe(false);
  });

  it('a cor sozinha também traduz, sem perder a cor de verdade', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({ busca: 'vaso amarelo', ativo: true });

    const valores = parametros(raiz);
    expect(valores).toContain('\\mOA\\M');
    // A palavra em português continua lá — as 11 peças de decoração amarela
    // de verdade não podem sumir por causa da tradução.
    expect(valores).toContain('%amarelo%');
  });
});

/**
 * ==========================================================================
 * O DICIONÁRIO NÃO PODE DERRUBAR O QUE JÁ FUNCIONAVA.
 *
 * O grupo novo é mais um nível de parênteses dentro do ramo das PALAVRAS.
 * Se ele vazar um nível para cima, cai no mesmo OU do código exato — e o
 * AN24084, peça sem estoque que a gestora precisa consultar, volta a sumir
 * em silêncio. Foi o defeito de 06/10, e ele não dá erro nenhum.
 * ==========================================================================
 */
describe('o dicionário e o código exato convivem', () => {
  it('o ramo do código não leva sigla nenhuma', async () => {
    const { repo, raiz } = repositorioFalso();

    await repo.findAll({
      busca: 'An24084 esmeralda',
      ativo: true,
      apenasDisponiveis: true,
    });

    const noDoCodigo = todosOsNos(raiz).find((n) =>
      n.condicao.includes('codigosDaBusca'),
    );
    expect(noDoCodigo).toBeDefined();
    expect(noDoCodigo?.filhos).toHaveLength(0);

    // A sigla está na consulta, e debaixo do MESMO grupo que carrega o filtro
    // de saldo — o ramo das palavras. O código mora do outro lado do OU, e
    // por isso aquele grupo não pode conhecê-lo.
    const ramoDasPalavras = grupos(raiz).find((g) =>
      g.filhos.some((f) => /HAVING SUM\(quantidade\) > 0/.test(f.condicao)),
    );

    expect(ramoDasPalavras).toBeDefined();
    expect(leva(ramoDasPalavras as No, '\\mESM\\M')).toBe(true);
    expect(
      todosOsNos(ramoDasPalavras as No).some((n) =>
        n.condicao.includes('codigosDaBusca'),
      ),
    ).toBe(false);
  });
});
