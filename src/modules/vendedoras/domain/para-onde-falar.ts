/**
 * PARA ONDE O SISTEMA FALA COM A VENDEDORA — 08/10/2026. RF16.
 *
 * ==========================================================================
 * SEIS DE SETE NAO RECEBIAM NADA, E SEM ERRO EM LUGAR NENHUM.
 *
 * Medido na base em 07/10 e conferido em 08/10:
 *
 *   vendedoras ativas .................. 7
 *   com WhatsApp CORPORATIVO (externo) . 7
 *   com WhatsApp INTERNO ............... 1
 *
 * O RECONHECIMENTO olha os dois numeros, entao todas as sete sao atendidas
 * quando ELAS escrevem para a Helena. Mas todo caminho em que o SISTEMA
 * escreve para ela — encaminhar lead, avisar, disparar pendencia, agendar
 * contato — pedia o interno, nao achava e desistia calado.
 *
 * Decisao do Lucas em 08/10: **o interno OU o corporativo**. O corporativo e
 * numero da empresa, so de trabalho e com ciencia dela — nao e mensagem de
 * trabalho caindo em telefone pessoal.
 * ==========================================================================
 *
 * ==========================================================================
 * POR QUE UMA FUNCAO, E NAO UM `||` EM CINCO ARQUIVOS.
 *
 * Cinco lugares tomavam essa decisao por conta propria:
 *
 *   avisar-vendedora, encaminhar-lead, disparar-pendencias,
 *   agendar-contato-gestao e encaminhar-pela-carteira.
 *
 * Cinco copias da mesma regra e como uma regra desanda: conserta-se em
 * quatro e a quinta continua muda — e muda e justamente o estado que nao
 * reclama. Agora os cinco PERGUNTAM, e mudar de ideia e mudar aqui.
 * ==========================================================================
 */

/** O que basta saber de uma vendedora para falar com ela. */
export interface TelefonesDaVendedora {
  whatsappInterno?: string | null;
  whatsappExterno?: string | null;
}

/**
 * Por qual aparelho a mensagem saiu.
 *
 * VAI JUNTO DE PROPOSITO. Sem isto, o retorno ao corporativo seria invisivel
 * no log, e ninguem saberia que seis das sete conversas estao acontecendo
 * pelo caminho reserva — nem que o cadastro do interno continua faltando.
 */
export type CanalDaVendedora = 'INTERNO' | 'CORPORATIVO';

export interface DestinoDaVendedora {
  numero: string;
  canal: CanalDaVendedora;
}

/** Numero vazio, so espaco ou nulo nao e numero. */
function numeroUtil(valor?: string | null): string | null {
  const limpo = (valor ?? '').trim();
  return limpo.length > 0 ? limpo : null;
}

/**
 * Para onde falar com esta vendedora — o interno primeiro, o corporativo
 * depois, `null` quando ela nao tem nenhum dos dois.
 *
 * A ORDEM E DELIBERADA. O interno e o aparelho da loja, pareado como sessao;
 * quando ele existe, e por ali que a conversa dela acontece. O corporativo e
 * o caminho reserva, e hoje e o unico caminho de seis das sete.
 */
export function destinoDaVendedora(
  vendedora: TelefonesDaVendedora | null | undefined,
): DestinoDaVendedora | null {
  const interno = numeroUtil(vendedora?.whatsappInterno);
  if (interno) return { numero: interno, canal: 'INTERNO' };

  const corporativo = numeroUtil(vendedora?.whatsappExterno);
  if (corporativo) return { numero: corporativo, canal: 'CORPORATIVO' };

  return null;
}

/**
 * Como o canal aparece no log — e NUNCA o numero, que e PII.
 *
 * O que interessa registrar e por onde saiu, para que a falta do cadastro do
 * interno apareca em vez de ficar escondida num sucesso.
 */
export function canalEmPalavras(canal: CanalDaVendedora): string {
  return canal === 'INTERNO' ? 'pelo interno' : 'pelo corporativo';
}
