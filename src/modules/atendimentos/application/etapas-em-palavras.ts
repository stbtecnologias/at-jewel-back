import type {
  ContagemPorEtapa,
  EtapaAtendimento,
} from '../domain/ports/repositories/atendimento-repository.port';

/**
 * A ETAPA DITA EM VOZ ALTA — o vocabulario que as agentes usam.
 *
 * ==========================================================================
 * MORA AQUI, E NAO DENTRO DE UM DOS SERVICOS DE FERRAMENTAS.
 *
 * Ate 21/09/2026 so a Anastasia falava de etapa, e o `rotuloEtapa` vivia
 * dentro do `FerramentasGestaoService`. Agora a Elena tambem fala — da
 * carteira dela. Deixar duas copias faria a MESMA etapa ter dois nomes
 * conforme quem perguntou, e ninguem descobriria isso ate alguem comparar as
 * duas conversas.
 * ==========================================================================
 */

/** A etapa em portugues de gente, para caber na frase da agente. */
export function rotuloEtapa(etapa: string): string {
  const mapa: Record<string, string> = {
    PRIMEIRO_CONTATO: 'primeiro contato',
    EM_NEGOCIACAO: 'em negociacao',
    REMARCADO: 'remarcado',
    SEM_CONTATO: 'nao conseguiu falar',
    CONCLUIDO: 'concluido',
    NAO_AVANCOU: 'nao avancou',
  };
  return mapa[etapa] ?? etapa.toLowerCase();
}

/**
 * As etapas que uma carteira ABERTA pode ter, na ordem em que se conta.
 *
 * CONCLUIDO e NAO_AVANCOU ficam de fora, e nao por escolha de estilo: as duas
 * SAO o desfecho, entao um atendimento em curso nunca esta nelas. Listar as
 * seis aqui faria duas linhas que dariam sempre zero.
 *
 * A ORDEM E A DO VOLUME, nao a da urgencia. Quem pergunta "como esta minha
 * carteira" quer primeiro o tamanho do normal — a negociacao — e depois as
 * excecoes. A urgencia vai noutro numero, o `aguardandoRelato`.
 */
const ABERTAS: EtapaAtendimento[] = [
  'EM_NEGOCIACAO',
  'REMARCADO',
  'SEM_CONTATO',
  'PRIMEIRO_CONTATO',
];

/**
 * Como cada etapa entra numa contagem, no singular e no plural.
 *
 * "1 remarcados" e "3 remarcado" soam a robo, e a agente repassa a linha como
 * ela chega — entao a concordancia tem de sair pronta daqui.
 */
const NA_FRASE: Record<string, { um: string; varios: string }> = {
  PRIMEIRO_CONTATO: { um: 'em primeiro contato', varios: 'em primeiro contato' },
  EM_NEGOCIACAO: { um: 'em negociacao', varios: 'em negociacao' },
  REMARCADO: { um: 'remarcado', varios: 'remarcados' },
  SEM_CONTATO: { um: 'sem conseguir falar', varios: 'sem conseguir falar' },
  CONCLUIDO: { um: 'concluido', varios: 'concluidos' },
  NAO_AVANCOU: { um: 'que nao avancou', varios: 'que nao avancaram' },
};

/**
 * A distribuicao como uma lista de contagens: `["5 em negociacao", "1 remarcado"]`.
 *
 * ETAPA ZERADA NAO VIRA LINHA. Dizer "0 remarcados" enche a frase de nada e
 * faz a agente ler uma lista de ausencias — quem tem cinco clientes todos em
 * negociacao quer ouvir uma linha, nao quatro.
 */
export function linhasDoFunil(porEtapa: ContagemPorEtapa): string[] {
  const linhas: string[] = [];
  for (const etapa of ABERTAS) {
    const quantos = porEtapa[etapa] ?? 0;
    if (quantos === 0) continue;
    const forma = NA_FRASE[etapa];
    linhas.push(`${quantos} ${quantos === 1 ? forma.um : forma.varios}`);
  }
  return linhas;
}

/**
 * A carteira numa frase so: "8 clientes em atendimento aberto: 5 em
 * negociacao, 2 remarcados e 1 sem conseguir falar."
 *
 * O "e" antes do ultimo item existe porque a agente repassa isto quase
 * literalmente, e uma lista com virgula ate o fim soa a relatorio.
 */
export function fraseDoFunil(
  total: number,
  porEtapa: ContagemPorEtapa,
): string {
  if (total === 0) return 'nenhum cliente em atendimento aberto';
  const partes = linhasDoFunil(porEtapa);
  const pessoas = total === 1 ? '1 cliente' : `${total} clientes`;
  if (partes.length === 0) return `${pessoas} em atendimento aberto`;
  const lista =
    partes.length === 1
      ? partes[0]
      : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
  return `${pessoas} em atendimento aberto: ${lista}`;
}
