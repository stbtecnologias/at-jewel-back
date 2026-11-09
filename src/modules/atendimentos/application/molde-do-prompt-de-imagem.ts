/**
 * O MOLDE DO PROMPT DE IMAGEM — 29/10/2026. Pedido do Lucas, para o Marketing.
 *
 * ==========================================================================
 * POR QUE ISTO E UM ARQUIVO, E NAO UMA STRING DENTRO DO SERVICO.
 *
 * Este texto e CONHECIMENTO DA CASA sobre como se pede tratamento de joia a
 * uma IA de imagem — a mesma natureza dos `shared/catalogo/sinonimos.ts` e
 * `shared/empresas/apelidos-de-empresa.ts`. Ele vai mudar quando o Marketing
 * descobrir que uma frase funciona melhor, e quem muda nao precisa entender o
 * servico que o usa. Num arquivo proprio, a mudanca se le no diff.
 * ==========================================================================
 *
 * O QUE O MARKETING FAZ HOJE, E O QUE ESTE MOLDE SUBSTITUI.
 *
 * Ele escreve o prompt a mao, em ingles, e cola na ferramenta de imagem dele
 * (Nano Banana 2). O pedido que ele digita e sempre generico — "tratamento no
 * padrao de catalogo de alta joalheria, fundo branco, tirar a massinha" —, mas
 * o prompt que ele produz descreve A PECA: "upper pear-shaped white diamond,
 * point up, with a halo of white diamonds in white gold".
 *
 * Essa diferenca e o trabalho todo, e ela vem de OLHAR A FOTO. E por isso que
 * a chamada leva a imagem, e nao so o texto dele.
 *
 * ==========================================================================
 * AS TRAVAS NAO SAO ENFEITE — LICAO DE 31/08/2026, JA PAGA NESTA CASA.
 *
 * Esta em `openai-tratamento-imagem.client.ts`: o modelo de imagem REGERA a
 * imagem em vez de edita-la. Num teste nosso ele devolveu uma alianca de metal
 * branco que NAO era a peca enviada. Por isso o nosso tratamento carrega uma
 * lista fixa do que nao pode mudar.
 *
 * O Marketing chegou sozinho a mesma conclusao, em outra ferramenta, e
 * escreveu a mao: *"same design, same number of stones, same angle, same
 * position and size in the frame"*.
 *
 * E a MESMA trava, descoberta duas vezes. Ela mora aqui para nao precisar de
 * uma terceira.
 * ==========================================================================
 */

/**
 * As cinco secoes do prompt, na ordem em que ele as escreve.
 *
 * A ORDEM IMPORTA PARA O MODELO DE IMAGEM: a peca primeiro (o que nao muda),
 * o tratamento depois (o que muda), e as proibicoes de cor no fim, perto da
 * saida. Instrucao no meio de texto longo e a que mais se perde — e a mesma
 * razao de o nosso `SEM_MUDAR` vir no comeco E no fim do prompt do catalogo.
 */
export const SECOES_DO_PROMPT = [
  'THE PIECE (keep design, angle and position identical)',
  'RETOUCHING TO APPLY ON THE JEWELRY',
  'COLOR (keep the real colors)',
  'BACKGROUND',
  'FINAL RESULT',
] as const;

/**
 * O teto de tokens da resposta.
 *
 * O prompt que ele mandou de exemplo tem ~2.600 caracteres, que e ~800 tokens.
 * O dobro cobre uma peca mais complexa (colar com muitas pedras) sem deixar a
 * resposta ser cortada no meio — prompt truncado e pior que prompt curto,
 * porque as travas de cor e fundo moram no FIM.
 */
export const MAXIMO_TOKENS = 2048;

/**
 * O sistema da chamada que escreve o prompt.
 *
 * ==========================================================================
 * EM INGLES, E SO O PROMPT.
 *
 * Ele vai COPIAR E COLAR o que chegar. Qualquer "aqui esta o seu prompt!" em
 * volta entra junto na ferramenta de imagem e vira instrucao para ela. A
 * regra de nao enfeitar nao e estilo: e corretude.
 * ==========================================================================
 */
export const SISTEMA_DO_PROMPT = `Voce escreve PROMPTS EM INGLES para uma IA de retoque de imagem (Nano Banana 2, gpt-image, Midjourney e afins), a partir da foto de uma joia e de um pedido em portugues.

QUEM PEDE: o marketing de uma joalheria de alto padrao. O destino e catalogo de e-commerce de luxo.

REGRA ABSOLUTA DA SUA RESPOSTA
Responda APENAS com o prompt em ingles. Nada antes, nada depois. Sem saudacao, sem "here is your prompt", sem explicacao, sem markdown de codigo, sem aspas em volta. A pessoa vai copiar sua resposta inteira e colar na ferramenta de imagem — qualquer palavra sua vira instrucao para ela.

A ESTRUTURA, NESTA ORDEM, com estes titulos em maiusculas:

1. Uma frase de abertura dizendo que e retoque profissional de joia de alto padrao, no padrao de catalogo de e-commerce de luxo, e que a peca deve continuar sendo A MESMA peca real da mesma fotografia.

2. THE PIECE (keep design, angle and position identical)
Descreva A PECA DA FOTO com precisao, em topicos: o tipo de joia, o angulo em que ela esta, cada pedra principal (lapidacao, formato, posicao, cor), os halos e pave, os metais de cada parte, o aro ou a corrente. Termine com: "Same design, same number of stones, same angle, same position and size in the frame."

3. RETOUCHING TO APPLY ON THE JEWELRY
Nitidez forte e profissional em cada faceta, garra e pedra; remocao de ruido, borrao e artefato de compressao; diamantes limpos e vivos, com cada pedra pequena legivel; metal polido, espelhado, sem risco, poeira, digital ou area opaca; iluminacao de estudio clara e uniforme.

4. COLOR (keep the real colors)
Fixe as cores REAIS que voce viu na foto e proiba os desvios que a IA de imagem costuma cometer com cada uma. Exemplos do tipo de frase: pedra rosa continua rosa, sem roxo, magenta, laranja ou salmao; diamante branco continua branco puro, sem dominante azul, verde ou cinza; ouro branco continua frio e nao amarelado; ouro rose continua rose suave e nao cobre; esmeralda continua verde e nao turquesa.

5. BACKGROUND
Fundo branco puro (#FFFFFF), uniforme de ponta a ponta. Remover faixa cinza, pontinhos, sujeira e QUALQUER APOIO VISIVEL — massinha, suporte, cera, pinca, base. Manter apenas uma sombra de contato suave e natural sob a peca.

6. FINAL RESULT
Uma frase de fechamento: foto nitida, clara, pronta para catalogo, da MESMA peca. Terminar sempre com: "Realistic and photographic, not CGI, not illustration, not a new piece of jewelry."

QUANDO VIER A FICHA DO CADASTRO
As vezes chega, junto da foto, a ficha da peca no sistema da casa — referencia, etiqueta, metal, pedras, peso. Quando ela vier, o criterio e este:

- A FOTO manda na FORMA: angulo, composicao, o que esta no quadro, como a peca esta posta.
- O CADASTRO manda nos NOMES: que pedra e, que metal e, quantas pedras sao, quantos quilates.

Use os nomes do cadastro no prompt em ingles. Se a ficha disser "ouro branco", escreva white gold com seguranca; se disser esmeralda, escreva emerald; se a etiqueta trouxer a contagem ("222 DIAM"), diga o numero.

SE A FICHA E A FOTO SE CONTRADISSEREM DE FORMA GRITANTE — a ficha diz anel e a foto mostra um colar —, nao invente uma peca que concilie as duas. Responda apenas, em portugues: FICHA_NAO_BATE

O QUE VOCE NUNCA FAZ
- Nunca invente pedra, formato, metal ou detalhe que voce nao ve na foto E que a ficha nao diz. Sem ficha, se nao da para ter certeza se a pedra e esmeralda ou turmalina, escreva a COR que voce ve ("green stone"), nao o nome que voce chutou. Prompt que nomeia errado faz a IA de imagem TROCAR a pedra.
- Nunca peca para mudar angulo, corte, enquadramento, proporcao, quantidade de pedras ou desenho — a menos que o pedido em portugues peca isso explicitamente.
- Nunca escreva texto, logotipo, marca d'agua ou pessoa na imagem.
- Nunca descreva a peca de forma generica ("a beautiful ring"): e a descricao especifica que impede a troca da peca.

O PEDIDO EM PORTUGUES
Ele MODIFICA o molde, nunca apaga as travas. Se a pessoa pedir fundo cinza, o fundo vira cinza e o resto continua. Se pedir "so a nitidez, sem mexer na cor", a secao de cor passa a dizer para preservar as cores exatamente como estao. Se o pedido nao falar de nada disso, siga o molde.

Se a foto NAO tiver joia nenhuma, responda apenas, em portugues: NAO_HA_JOIA`;

/**
 * O que a chamada diz ao modelo junto da imagem.
 *
 * O PEDIDO VEM ANTES DA FOTO no corpo, igual ao `AnalisarArquivoService`: o
 * modelo le na ordem, e precisa saber o que vao pedir antes de olhar a imagem.
 */
export function corpoDoPedido(pedido: string, ficha?: string | null): string {
  const limpo = pedido.trim();
  const oPedido = limpo
    ? `Pedido do marketing, em portugues: ${limpo}`
    : 'O marketing mandou a foto sem escrever nada. Trate como o pedido padrao: tratamento de catalogo de alta joalheria, fundo branco puro, remocao do apoio, sombra de contato suave.';

  // A FICHA DEPOIS DO PEDIDO E ANTES DA FOTO: o modelo le na ordem, e o que
  // ele precisa saber primeiro e o que vao pedir.
  const oCadastro = ficha?.trim()
    ? `\n\n--- ficha da peca no sistema da casa ---\n${ficha.trim()}\n--- fim da ficha ---`
    : '';

  return `${oPedido}${oCadastro}\n\nA foto da peca vai anexada. Escreva o prompt em ingles.`;
}

/** A resposta do modelo quando nao ha joia na foto. Ver `SISTEMA_DO_PROMPT`. */
export const SEM_JOIA = 'NAO_HA_JOIA';

/** A resposta do modelo quando a ficha descreve outra peca. */
export const FICHA_NAO_BATE = 'FICHA_NAO_BATE';
