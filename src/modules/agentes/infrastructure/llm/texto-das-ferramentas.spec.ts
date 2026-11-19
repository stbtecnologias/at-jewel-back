import * as fs from 'fs';
import * as path from 'path';

/**
 * ==========================================================================
 * TEXTO CORROMPIDO NAO QUEBRA NADA — E E ISSO QUE O TORNA CARO.
 *
 * Em 17/11, uma insercao cega enfiou a frase do escopo de equipe NO MEIO de
 * outra frase, em QUATRO textos de ferramenta. E num deles sobrou um `+` a
 * mais, que em JavaScript nao concatena: `'texto ' + +'outro'` aplica o mais
 * unario, da `NaN`, e o resultado e a string "texto NaN".
 *
 * Nenhum dos dois quebra o `tsc` — concatenar string com numero e valido — e
 * nenhum teste lia a descricao. Foram para producao e la ficaram, com o
 * modelo recebendo:
 *
 *   "...E REPASSE A NOTA QUANDO O CABECALHO DISSER A SUA EQUIPE, (...) da
 *    loja inteira.: uma peca com duas pedras conta nas duas..."
 *
 * A frase original era "E REPASSE A NOTA: uma peca com duas pedras conta nas
 * duas". A insercao separou "A NOTA" do que ela explicava, e deixou o `.:`
 * como assinatura do estrago.
 *
 * ESTE TESTE LE O PROPRIO ARQUIVO, como o `ferramentas-ligadas.spec.ts`. E
 * grosseiro de proposito: o que se quer garantir e textual.
 * ==========================================================================
 */
describe('os textos que vao ao modelo', () => {
  const arquivo = fs.readFileSync(
    path.join(__dirname, 'anthropic.client.ts'),
    'utf8',
  );

  /**
   * A ASSINATURA DA CONCATENACAO QUEBRADA.
   *
   * `' + +` e `" + +` produzem `NaN` em silencio. Qualquer um dos dois e
   * defeito, sem excecao legitima: somar string com numero num texto que vai
   * ao modelo nunca e o que se queria.
   */
  it('nenhuma concatenacao com o mais unario', () => {
    const quebradas = arquivo
      .split('\n')
      .map((linha, i) => [i + 1, linha] as const)
      .filter(([, linha]) => /['"`]\s*\+\s*\+/.test(linha));

    expect(
      quebradas.map(([n, l]) => `${n}: ${l.trim().slice(0, 80)}`),
    ).toEqual([]);
  });

  /**
   * O `.:` so aparece quando uma frase foi enfiada dentro de outra.
   *
   * A UNICA EXCECAO LEGITIMA E `ex.:` (e `Ex.:`), a abreviacao de
   * arquivo usa em sete descricoes de data e hora. Fora dela, nao ha uso
   * de ponto seguido de dois-pontos em texto corrido.
   */
  it('nenhum ".:" — e a marca de frase enfiada no meio de frase', () => {
    const marcadas = arquivo
      .split('\n')
      .map((linha, i) => [i + 1, linha] as const)
      // Tudo menos o `ex.:` legitimo.
      .filter(([, linha]) => /(?<!\b[Ee]x)\.:/.test(linha));

    expect(marcadas.map(([n, l]) => `${n}: ${l.trim().slice(0, 80)}`)).toEqual(
      [],
    );
  });

  /* ESTE E O TESTE QUE PEGA OS QUATRO. */
  it('a frase do escopo de equipe termina a instrucao, e nao a parte', () => {
    const FIM = 'parece ser da loja inteira.';
    const partidas: string[] = [];

    for (const linha of arquivo.split('\n')) {
      const i = linha.indexOf(FIM);
      if (i === -1) continue;
      // O que vem depois dela, dentro da mesma linha, tem de ser so o
      // fechamento da string — aspas, virgula, mais, parentese.
      const depois = linha.slice(i + FIM.length);
      if (/[A-Za-zÀ-ÿ0-9—,:]/.test(depois)) {
        partidas.push(linha.trim().slice(0, 100));
      }
    }

    expect(partidas).toEqual([]);
  });

  /**
   * NENHUM TEXTO LEVA `NaN` NEM `undefined` LITERAIS. O primeiro e o estrago
   * do mais unario; o segundo e o de interpolar um campo que nao veio.
   */
  it.each(['NaN', 'undefined'])(
    'nenhum texto de ferramenta carrega "%s" literal',
    (lixo) => {
      const linhas = arquivo
        .split('\n')
        .map((linha, i) => [i + 1, linha] as const)
        // So o que esta DENTRO de aspas simples: `undefined` como valor de
        // TypeScript e legitimo e aparece em todo lugar.
        .filter(([, linha]) => {
          const textos = linha.match(/'[^']*'/g) ?? [];
          return textos.some((t) => t.includes(lixo));
        });

      expect(
        linhas.map(([n, l]) => `${n}: ${l.trim().slice(0, 80)}`),
      ).toEqual([]);
    },
  );
});
