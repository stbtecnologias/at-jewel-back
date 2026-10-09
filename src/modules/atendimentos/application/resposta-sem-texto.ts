/**
 * QUANDO O MODELO NÃO ESCREVE NADA, O CANAL AINDA PRECISA FALAR — 09/10/2026.
 *
 * ==========================================================================
 * ACONTECEU EM PRODUÇÃO, E O SINTOMA FOI SILÊNCIO.
 *
 *   — "quem tem leads hoje"
 *   — "o 'hoje' na fila de leads só vale olhando por vendedora. Você quer a
 *      fila geral, ou os leads de uma vendedora específica?"
 *   — "geral"
 *   — (a agente mostrou "digitando..." e parou. Nada chegou.)
 *
 * O caminho: o modelo devolveu resposta SEM TEXTO, o use case devolveu
 * `resposta: ''`, e o webhook — que trata `!resposta` como "não há o que
 * responder" — não enviou nada. A regra do webhook é CERTA para o canal do
 * cliente, onde áudio vazio e mensagem em branco existem e o silêncio é a
 * resposta adequada. No canal interno ela é outra coisa: quem perguntou foi
 * reconhecida, viu "digitando...", e ficou esperando.
 *
 * É a mesma família do defeito do áudio em 21/08: "quem mandava não recebia
 * nada e nem sabia por quê". A resposta mais cara é a que não existe, porque
 * ninguém abre chamado para uma mensagem que não chegou.
 * ==========================================================================
 *
 * A FRASE DIZ O QUE FAZER, e não só que falhou. "Tente de novo" numa resposta
 * cortada por tamanho só repete o corte; o que resolve é pedir menos.
 */
export function respostaQuandoNaoVeioTexto(
  motivo: 'max_tokens' | 'refusal' | 'outro' | undefined,
): string {
  switch (motivo) {
    case 'max_tokens':
      // O caso esperado: a lista era longa e o teto cortou antes da primeira
      // palavra. Repetir a mesma pergunta dá o mesmo corte.
      return (
        'A resposta ficou longa demais e foi cortada antes de eu conseguir ' +
        'escrever. Pede de novo pedindo menos de uma vez — por vendedora, ' +
        'por um dia, ou só os primeiros.'
      );
    case 'refusal':
      return 'Não consigo responder isso. Se for engano meu, me pergunta de outro jeito.';
    default:
      return (
        'Me perdi no meio da resposta e não cheguei a escrever nada. ' +
        'Pode repetir a pergunta?'
      );
  }
}
