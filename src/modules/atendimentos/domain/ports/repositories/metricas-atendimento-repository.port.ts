/**
 * AS METRICAS DE ATENDIMENTO — ANA-08 a ANA-12, 29/09/2026.
 *
 * ==========================================================================
 * TUDO AQUI SAI DE DADO QUE JA EXISTE. NENHUMA COLUNA NOVA.
 *
 * A auditoria de 28/09 dizia que as sete metricas do documento "dependem de um
 * relogio que nao existe". Depois de olhar as tabelas: o relogio existe desde
 * sempre — `atendimento_interacoes.ocorrido_em` carimba cada ponto, e
 * `atendimentos.aberto_em` / `fechado_em` / `desfecho` fecham o episodio.
 *
 * O que faltava nao era coluna: era alguem perguntar.
 * ==========================================================================
 *
 * O PERIODO E OBRIGATORIO EM TODAS. Media sem recorte de tempo e numero que
 * so piora — conforme a base cresce ela vira o historico da loja inteira, e
 * ninguem consegue dizer se este mes foi melhor que o passado.
 */

export interface JanelaDeMetrica {
  de: Date;
  ate: Date;
  /**
   * O recorte de equipe, quando quem pergunta e gerente. `null` = a loja
   * inteira. Vazio (`[]`) NAO e o mesmo que `null`: e "a equipe dela nao tem
   * ninguem", e a resposta certa e zero, nao tudo.
   */
  vendedoraIds?: string[] | null;
}

/** ANA-08 — quantos leads cada vendedora recebeu no periodo. */
export interface LeadsDaVendedora {
  vendedoraId: string | null;
  codigo: string | null;
  nome: string;
  quantos: number;
}

/** ANA-12 — quantos pontos de contato cada vendedora registrou. */
export interface InteracoesDaVendedora {
  vendedoraId: string;
  nome: string;
  /** Tudo que entrou no episodio: contato da cliente, resposta dela, relato. */
  total: number;
  /** So o que a VENDEDORA fez — e o que separa esforco de movimento. */
  daVendedora: number;
  /** Em quantos atendimentos distintos esses pontos aconteceram. */
  atendimentos: number;
}

/**
 * Uma media com o tamanho da amostra junto.
 *
 * ==========================================================================
 * O `n` NAO E ENFEITE, E A DIFERENCA ENTRE INFORMACAO E RUIDO.
 *
 * Em 29/09/2026 a base tinha UM lead e UM celular conectado. Uma media de
 * "18 minutos" calculada sobre um unico atendimento parece um indicador e e
 * uma anedota. Sem o `n` ao lado, quem le nao tem como saber a diferenca — e
 * vai tomar decisao de operacao em cima de uma amostra de um.
 * ==========================================================================
 */
export interface MediaDeTempo {
  /** Minutos. `null` quando nao houve nenhum caso no periodo. */
  minutos: number | null;
  /** Quantos casos entraram na conta. */
  amostra: number;
  /** O mais rapido e o mais lento, que a media sozinha esconde. */
  minimo: number | null;
  maximo: number | null;
}

export interface IMetricasAtendimentoRepository {
  /** ANA-08 */
  leadsPorVendedora(janela: JanelaDeMetrica): Promise<LeadsDaVendedora[]>;

  /** ANA-12 */
  interacoesPorVendedora(
    janela: JanelaDeMetrica,
  ): Promise<InteracoesDaVendedora[]>;

  /**
   * ANA-09 — do primeiro contato da cliente ate a primeira resposta.
   *
   * SO O PRIMEIRO PAR DE CADA ATENDIMENTO. Somar todas as respostas daria
   * "tempo medio de resposta", que e outra coisa: um atendimento com trinta
   * trocas rapidas afogaria o unico que demorou dois dias para o primeiro
   * "oi" — e e o primeiro "oi" que faz a cliente desistir.
   *
   * Atendimento em que a vendedora NUNCA respondeu fica de fora da media, de
   * proposito: ele nao tem tempo de resposta, tem ausencia de resposta. Vira
   * alerta (ANA-04), nao media.
   */
  tempoPrimeiraResposta(janela: JanelaDeMetrica): Promise<MediaDeTempo>;

  /** ANA-10 — de `aberto_em` a `fechado_em`, so os que fecharam. */
  tempoDeAtendimento(janela: JanelaDeMetrica): Promise<MediaDeTempo>;

  /** ANA-11 — o mesmo, restrito aos que fecharam em VENDA. */
  tempoAteFecharVenda(janela: JanelaDeMetrica): Promise<MediaDeTempo>;
}

export const METRICAS_ATENDIMENTO_REPOSITORY = Symbol(
  'IMetricasAtendimentoRepository',
);
