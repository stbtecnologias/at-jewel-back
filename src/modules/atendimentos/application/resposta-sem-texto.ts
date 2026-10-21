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

/**
 * O TURNO NÃO ESCREVEU NADA, MAS PRODUZIU ALGUMA COISA — 21/10/2026.
 *
 * ==========================================================================
 * ACONTECEU NO PRIMEIRO "GERA O PDF" DE VERDADE, ÀS 14:57.
 *
 *   — "quais peças mais vendidas em julho"  (a agente listou as dez)
 *   — "gera o pdf"
 *   — "Me perdi no meio da resposta e não cheguei a escrever nada."
 *
 * O PDF EXISTIA. A ferramenta rodou, o arquivo foi montado e estava na mão
 * do caso de uso — e o modelo, com a ação já concluída no `tool_result`,
 * encerrou o turno sem escrever uma palavra. O guarda do texto vazio então
 * devolveu a frase de desculpa e **descartou o arquivo junto**, porque o
 * webhook não envia anexo quando não há texto.
 *
 * Ou seja: a agente pediu desculpa por não ter feito exatamente a coisa que
 * ela tinha acabado de fazer.
 * ==========================================================================
 *
 * A REGRA QUE FICA: turno que produziu artefato não termina em desculpa. O
 * silêncio do modelo é defeito dele, e segue no log — mas o que ela pediu
 * sai, porque já está pronto.
 *
 * Devolve `null` quando não houve artefato nenhum: aí a desculpa é a resposta
 * certa, e quem chama volta para `respostaQuandoNaoVeioTexto`.
 */
export function respostaQuandoVeioSoArtefato(artefato: {
  arquivo?: boolean;
  fotos?: number;
}): string | null {
  const comFotos = (artefato.fotos ?? 0) > 0;

  if (artefato.arquivo && comFotos) {
    return 'Segue o arquivo que você pediu, e as fotos logo abaixo.';
  }
  // O NOME DO ARQUIVO NÃO ENTRA NA FRASE: ele já vai na legenda do anexo,
  // escrito por quem o montou. Repetir aqui é mais um lugar para divergir.
  if (artefato.arquivo) return 'Segue o arquivo que você pediu.';
  if (comFotos) {
    return artefato.fotos === 1 ? 'Segue a foto.' : 'Seguem as fotos.';
  }
  return null;
}
