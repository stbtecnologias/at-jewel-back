/**
 * PARA ONDE O SISTEMA FALA COM A VENDEDORA — 08/10/2026. RF16.
 *
 * ==========================================================================
 * SEIS DE SETE NAO RECEBIAM NADA, E SEM ERRO EM LUGAR NENHUM.
 *
 * Medido na base em 07/10 e conferido em 08/10:
 *
 *   vendedoras ativas .................. 7
 *   com o CORPORATIVO (whatsapp_externo) 7
 *   com o PESSOAL     (whatsapp_interno) 1
 *
 * O RECONHECIMENTO olha os dois numeros (`buscarPorWhatsappHash` casa pelo
 * hash do interno OU do externo), entao todas as sete sao atendidas quando
 * ELAS escrevem para a Elena. Mas todo caminho em que o SISTEMA escreve para
 * ela — encaminhar lead, avisar, disparar pendencia, agendar contato — pedia
 * o `whatsapp_interno` e so ele: nao achava e desistia calado.
 *
 * Decisao do Lucas em 08/10: **os dois valem, e o corporativo vem primeiro.**
 * ==========================================================================
 *
 * ==========================================================================
 * O NOME DAS COLUNAS ENGANA, E JA ENGANOU AQUI DENTRO.
 *
 * `whatsapp_interno` e `whatsapp_externo` nao dizem a ninguem qual e qual, e
 * tres lugares deste repositorio se contradiziam em 08/10 — a migracao 39
 * ("a diferenca e de INTERLOCUTOR"), o DTO e a tela. A tela esta certa, e e
 * a leitura que vale:
 *
 *   whatsapp_interno  ->  o celular PESSOAL dela. O sistema nao le NADA
 *                         daqui; o que se sabe e o que ela conta a Elena.
 *   whatsapp_externo  ->  o CORPORATIVO, o chip da empresa. E nosso, e e ele
 *                         que pareia a sessao de WhatsApp dela no painel.
 *
 * POR ISSO O CORPORATIVO VEM PRIMEIRO. O alinhamento de 07/10 pediu o
 * aparelho da empresa "para rastrear as comunicacoes", e e exatamente o que
 * o corporativo da: a conversa fica visivel ao sistema. Mensagem entregue no
 * celular pessoal e mensagem que ninguem consegue auditar depois.
 *
 * E o pessoal CONTINUA VALENDO como segundo caminho — "olhe sempre os dois",
 * nas palavras do Lucas. Hoje so uma das sete tem os dois cadastrados, entao
 * na pratica a ordem muda pouco; e a REGRA que fica valendo.
 *
 * As colunas mantem os nomes antigos (sao o banco). Daqui para dentro a
 * conversa e em PESSOAL e CORPORATIVO.
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
 * reclama. Agora os cinco PERGUNTAM, e mudar de ideia e mudar aqui (como de
 * fato aconteceu horas depois, quando a ordem virou).
 * ==========================================================================
 */

/** O que basta saber de uma vendedora para falar com ela. */
export interface TelefonesDaVendedora {
  /** `whatsapp_interno` — o celular PESSOAL dela. */
  whatsappInterno?: string | null;
  /** `whatsapp_externo` — o CORPORATIVO, o chip da empresa. */
  whatsappExterno?: string | null;
}

/**
 * Por qual aparelho a mensagem saiu.
 *
 * VAI JUNTO DE PROPOSITO. Sem isto, cair no pessoal seria invisivel no log —
 * e cair no pessoal e justamente o caso que a empresa quer saber, porque e o
 * que ela nao consegue acompanhar.
 */
export type CanalDaVendedora = 'CORPORATIVO' | 'PESSOAL';

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
 * Para onde falar com esta vendedora — o CORPORATIVO primeiro, o pessoal
 * depois, `null` quando ela nao tem nenhum dos dois.
 *
 * Os dois valem sempre; o que a ordem decide e quem ganha quando ela tem os
 * dois cadastrados. Ver o cabecalho para o porque do corporativo na frente.
 */
export function destinoDaVendedora(
  vendedora: TelefonesDaVendedora | null | undefined,
): DestinoDaVendedora | null {
  const corporativo = numeroUtil(vendedora?.whatsappExterno);
  if (corporativo) return { numero: corporativo, canal: 'CORPORATIVO' };

  const pessoal = numeroUtil(vendedora?.whatsappInterno);
  if (pessoal) return { numero: pessoal, canal: 'PESSOAL' };

  return null;
}

/**
 * Como o canal aparece no log — e NUNCA o numero, que e PII.
 *
 * O que interessa registrar e por onde saiu, para que a mensagem entregue no
 * celular pessoal apareca em vez de ficar escondida num sucesso.
 */
export function canalEmPalavras(canal: CanalDaVendedora): string {
  return canal === 'CORPORATIVO' ? 'pelo corporativo' : 'pelo pessoal';
}
