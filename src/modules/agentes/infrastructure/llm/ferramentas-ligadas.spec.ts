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
});
