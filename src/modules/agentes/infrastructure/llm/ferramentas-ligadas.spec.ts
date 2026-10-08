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
