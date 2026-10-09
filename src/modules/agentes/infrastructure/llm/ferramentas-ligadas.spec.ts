import * as fs from 'fs';
import * as path from 'path';

/**
 * TODA FERRAMENTA DECLARADA TEM DE TER DESPACHO — 29/09/2026.
 *
 * ==========================================================================
 * O DEFEITO QUE ESTE TESTE EXISTE PARA IMPEDIR NAO APARECE EM LUGAR NENHUM.
 *
 * Declarar a ferramenta ao modelo e LIGAR A EXECUCAO dela sao dois passos, em
 * dois pontos distantes do mesmo arquivo. Fazer so o primeiro compila, passa
 * no `tsc`, passa em todo teste unitario — e quebra em producao do pior jeito:
 *
 *   o modelo chama a ferramenta
 *   nenhum ramo responde
 *   o `tool_result` vai vazio
 *   a API recusa a conversa INTEIRA com
 *     `400 messages.N: user messages must have non-empty content`
 *   e o agente responde "nao consegui consultar isso agora"
 *
 * O 400 nao diz qual ferramenta faltou. Aconteceu em 29/09/2026 com CINCO de
 * uma vez — metricas, rankings, comparacao entre anos, comparacao com o
 * periodo anterior e analise de tom —, e o teste que eu tinha feito chamava os
 * handlers DIRETO, pulando exatamente o passo que faltava.
 *
 * Este teste le o proprio arquivo. E grosseiro de proposito: qualquer coisa
 * mais elegante exigiria carregar o cliente e dubla-lo inteiro, e o que se
 * quer garantir e textual — que os dois lugares citem o mesmo nome.
 * ==========================================================================
 */
describe('as ferramentas declaradas ao modelo', () => {
  const arquivo = fs.readFileSync(
    path.join(__dirname, 'anthropic.client.ts'),
    'utf8',
  );

  /** Os `name: 'x'` de dentro dos objetos `Anthropic.Tool`. */
  const declaradas = [
    ...arquivo.matchAll(/^\s*name:\s*'([a-z_]+)',$/gm),
  ].map((m) => m[1]);

  /** Os `toolUse.name === 'x'` do laço de despacho. */
  const despachadas = new Set(
    [...arquivo.matchAll(/toolUse\.name === '([a-z_]+)'/g)].map((m) => m[1]),
  );

  it('o arquivo declara ferramentas (o teste não está lendo nada)', () => {
    expect(declaradas.length).toBeGreaterThan(20);
  });

  /*
   * ESTE E O TESTE.
   *
   * Duas ferramentas compartilham nome de proposito (`consultar_produtos` e
   * `itens_mais_vendidos` tem duas versoes cada, uma por canal), e por isso a
   * comparacao e por conjunto e nao por contagem.
   */
  it.each([...new Set(declaradas)])(
    'a ferramenta "%s" tem ramo de despacho',
    (nome) => {
      expect(despachadas.has(nome)).toBe(true);
    },
  );

  /* O contrario tambem importa: um ramo para ferramenta que ninguem declara e
   * codigo morto, e costuma ser resto de renomeacao. */
  it.each([...despachadas])('o despacho de "%s" corresponde a uma declaração', (nome) => {
    expect(declaradas).toContain(nome);
  });

  /**
   * ========================================================================
   * O NUMERO QUE A DESCRICAO PROMETE TEM DE SER O TETO DE VERDADE —
   * 08/10/2026.
   *
   * Achado ao responder uma pergunta do Lucas sobre o canal da Helena: a
   * descricao de `consultar_produtos` da VENDEDORA dizia "Devolve no maximo
   * SEIS pecas", e o teto real ja era DEZ desde o RF4, em 07/10. A frase
   * ficou para tras quando a constante subiu.
   *
   * E O DEFEITO NAO DA ERRO NENHUM. O modelo acredita na descricao: recebe
   * dez pecas e pode listar seis, ou dizer a vendedora que "so consigo ver
   * seis". E a mesma familia do "ela anunciou vinte e listou dez" de 07/10,
   * agora pelo lado da promessa.
   *
   * Este teste le o numero da FRASE e a constante do CODIGO, e exige que
   * batam. Mudar o teto sem mudar a frase passa a quebrar aqui.
   * ========================================================================
   */
  describe('o teto prometido ao modelo', () => {
    const porExtenso: Record<string, number> = {
      tres: 3,
      cinco: 5,
      seis: 6,
      dez: 10,
      quinze: 15,
      vinte: 20,
    };

    /** O teto de verdade, lido da constante de cada canal. */
    function tetoReal(caminho: string, constante: string): number {
      const fonte = fs.readFileSync(path.join(__dirname, caminho), 'utf8');
      const m = new RegExp(`${constante}\\s*=\\s*(\\d+)`).exec(fonte);
      expect(m).not.toBeNull();
      return Number(m![1]);
    }

    const tetos = [
      tetoReal(
        '../../../atendimentos/application/use-cases/consultar-produtos-vendedora.use-case.ts',
        'MAXIMO',
      ),
      tetoReal(
        '../../../atendimentos/application/ferramentas-gestao.service.ts',
        'TETO_DE_PRODUTOS',
      ),
    ];

    /* ESTE É O TESTE. */
    it('toda promessa de "no maximo N pecas" bate com um teto real', () => {
      const prometidos = [
        ...arquivo.matchAll(/no maximo ([A-Za-z]+) pecas/gi),
      ].map((m) => m[1].toLowerCase());

      // Se a frase sumir das descricoes este teste perde o que guardar — e
      // isso tambem e uma mudanca que alguem tem de ver.
      expect(prometidos.length).toBeGreaterThan(0);

      for (const palavra of prometidos) {
        expect(porExtenso).toHaveProperty(palavra);
        expect(tetos).toContain(porExtenso[palavra]);
      }
    });

    it('os dois canais tem o mesmo teto, e e dez', () => {
      // Se um dia divergirem, a descricao compartilhada precisa dizer qual e
      // qual — e aqui e o lugar de decidir isso de proposito.
      expect(tetos[0]).toBe(tetos[1]);
      expect(tetos[0]).toBe(10);
    });
  });
});

/**
 * ============================================================================
 * NOME REPETIDO SO VALE COM GUARDA DE EXCLUSAO — 09/10/2026.
 *
 * Duas ferramentas podem compartilhar nome de proposito: `consultar_produtos`
 * e `itens_mais_vendidos` tem uma versao por canal. Isso FUNCIONA porque a
 * registracao da versao de gestao carrega `&& !params.<chave da vendedora>` —
 * sem a guarda, as duas entram no mesmo array e a API recebe o mesmo nome
 * duas vezes.
 *
 * ACHADO ESCREVENDO O `clientes_por_fidelidade`, em 09/10. Eu dei o mesmo
 * nome as duas versoes e esqueci a guarda. Nao quebrou `tsc`, nao quebrou
 * teste nenhum, e so apareceria com a NATHALIA — a unica pessoa que recebe os
 * dois conjuntos, porque e gerente de vendas e vendedora com um numero so.
 * Para as outras seis vendedoras e para a gestao, cada canal recebe um
 * conjunto, e o defeito seria invisivel.
 *
 * A correcao foi dar nomes distintos (`meus_clientes_por_fidelidade` para a
 * carteira dela), que e melhor que a guarda: com a guarda ela perderia uma
 * das duas perguntas. Este teste aceita os dois caminhos — o que ele nao
 * aceita e nome repetido SEM nenhum dos dois.
 * ============================================================================
 */
describe('nome de ferramenta repetido', () => {
  const arquivo = fs.readFileSync(
    path.join(__dirname, 'anthropic.client.ts'),
    'utf8',
  );
  const linhas = arquivo.split('\n');

  /** Cada constante `X_TOOL` e o `name:` que ela declara. */
  const nomePorConstante = new Map<string, string>();
  for (const m of arquivo.matchAll(
    /const (\w+_TOOL): Anthropic\.Tool = \{\s*\n\s*name:\s*'([a-z_]+)'/g,
  )) {
    nomePorConstante.set(m[1], m[2]);
  }

  /**
   * ONDE cada constante e empurrada, e sob qual `if`.
   *
   * ======================================================================
   * DUAS FORMAS DE EXCLUSAO CONVIVEM NESTE ARQUIVO, e as duas valem:
   *
   *   GUARDA   `if (params.gestaoProdutos && !params.consultarProdutos)` —
   *            separa CANAIS. A de gestao nao entra quando a da vendedora
   *            esta presente.
   *
   *   TERNARIO `tools.push(exige ? A_TOOL : B_TOOL)` — separa ESCOPOS dentro
   *            do mesmo canal. Um `push` so, duas candidatas, uma entra.
   *
   * O primeiro resultado deste teste acusou o `itens_mais_vendidos`, que usa
   * ternario e nao guarda. Nao era defeito: era o criterio estreito demais.
   * ======================================================================
   */
  const sitesPorConstante = new Map<
    string,
    { site: number; guarda: string }[]
  >();
  linhas.forEach((linha, i) => {
    if (!linha.includes('tools.push(')) return;

    // A constante pode estar nas linhas SEGUINTES — o ternario quebra em tres.
    const alcance = linhas.slice(i, i + 5).join(' ');
    let guarda = '';
    for (let j = i; j >= 0 && j > i - 8; j--) {
      if (linhas[j].includes('if (params.')) {
        guarda = linhas[j];
        break;
      }
    }
    for (const m of alcance.matchAll(/(\w+_TOOL)\b/g)) {
      const lista = sitesPorConstante.get(m[1]) ?? [];
      lista.push({ site: i, guarda });
      sitesPorConstante.set(m[1], lista);
    }
  });

  it('o teste está lendo as constantes de verdade', () => {
    expect(nomePorConstante.size).toBeGreaterThan(20);
    expect(sitesPorConstante.size).toBeGreaterThan(20);
  });

  /** Os nomes declarados por MAIS DE UMA constante. */
  const nomes = [...nomePorConstante.values()];
  const repetidos = [
    ...new Set(nomes.filter((n) => nomes.filter((o) => o === n).length > 1)),
  ];

  it('há nomes repetidos para conferir (senão o teste não testa nada)', () => {
    expect(repetidos.length).toBeGreaterThan(0);
  });

  /* ESTE É O TESTE. */
  it.each(repetidos)(
    'o nome repetido "%s" é exclusivo — por guarda ou por ternário',
    (nome) => {
      const constantes = [...nomePorConstante.entries()]
        .filter(([, n]) => n === nome)
        .map(([c]) => c);

      for (const a of constantes) {
        for (const b of constantes) {
          if (a === b) continue;
          const sitesA = sitesPorConstante.get(a) ?? [];
          const sitesB = sitesPorConstante.get(b) ?? [];
          // Mesmo `push`: o ternário escolhe uma e só uma.
          const mesmoSite = sitesA.some((x) =>
            sitesB.some((y) => y.site === x.site),
          );
          // Ou alguma das duas só entra quando a outra NÃO está.
          const comGuarda = [...sitesA, ...sitesB].some((s) =>
            s.guarda.includes('!params.'),
          );
          expect(mesmoSite || comGuarda).toBe(true);
        }
      }
    },
  );

  /**
   * E O CAMINHO QUE A FIDELIDADE ESCOLHEU: nenhum dos dois.
   *
   * Nomes DISTINTOS, para a Nathalia — que recebe os dois conjuntos — poder
   * perguntar as duas coisas. Com guarda ela perderia uma delas; com o mesmo
   * nome e sem guarda, o conjunto sairia com nome repetido, que foi o defeito
   * que eu escrevi em 09/10 e este arquivo pegou.
   */
  it('as duas versões da fidelidade têm nomes DISTINTOS', () => {
    expect(nomePorConstante.get('FIDELIDADE_TOOL')).toBe(
      'meus_clientes_por_fidelidade',
    );
    expect(nomePorConstante.get('GESTAO_FIDELIDADE_TOOL')).toBe(
      'clientes_por_fidelidade',
    );
  });
});
