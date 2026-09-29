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

/**
 * ANA-13 — a taxa de conversao.
 *
 * ==========================================================================
 * A CONTA E SOBRE O QUE JA TEVE DESFECHO, E NAO SOBRE TUDO.
 *
 * Dividir ganhos pelo TOTAL faria a taxa despencar sozinha a cada lead novo:
 * quem entrou ontem ainda nao teve chance de comprar, e entraria no
 * denominador como se tivesse recusado. No fim de uma semana movimentada a
 * conversao pareceria pior justamente porque a operacao foi bem.
 *
 * Entao: `ganhos / (ganhos + perdidos)`. Os em aberto vao na resposta a
 * parte, porque "40% de conversao, com 30 ainda em aberto" e uma frase
 * honesta e "40%" sozinho nao e.
 * ==========================================================================
 */
export interface Conversao {
  ganhos: number;
  perdidos: number;
  /** NOVO, EM_ATENDIMENTO e PARADO — ainda podem virar qualquer coisa. */
  emAberto: number;
  /**
   * Percentual de 0 a 100, ou `null` quando nada teve desfecho ainda.
   *
   * `null` e nao zero: zero afirma "ninguem comprou", e nao e o que
   * aconteceu quando simplesmente nada fechou.
   */
  taxa: number | null;
}

/**
 * Um par "cliente escreveu / vendedora respondeu" — ANA-14.
 *
 * ==========================================================================
 * OS PARES VOLTAM CRUS, E A CONTA DO RELOGIO E FEITA EM TYPESCRIPT.
 *
 * O horario comercial nao cabe bem em SQL: seria um CASE por borda, e as
 * bordas sao exatamente onde o calculo erra. Em TypeScript ele e uma funcao
 * testada (`minutosDeExpediente`), com dezenove casos guardados.
 *
 * O volume permite: e um par por atendimento, e atendimento aberto e coisa
 * rara. Se um dia nao permitir, o conserto e agregar por vendedora no banco e
 * trazer so os extremos — nao e voltar o relogio para o SQL.
 * ==========================================================================
 */
export interface ParDeResposta {
  vendedoraId: string;
  nome: string;
  contatoEm: Date;
  respostaEm: Date;
}

/** Ganhos e perdidos de cada vendedora, para a conversao do ranking. */
export interface DesfechoDaVendedora {
  codigo: string;
  nome: string;
  ganhos: number;
  perdidos: number;
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

  /**
   * ANA-13 — quantos leads viraram venda, entre os que tiveram desfecho.
   *
   * A JANELA OLHA A CRIACAO DO LEAD, e nao a mudanca de estado: "a conversao
   * dos leads de setembro" e sobre quem CHEGOU em setembro, mesmo que tenha
   * fechado em outubro. Olhar o desfecho responderia outra pergunta e
   * misturaria safras.
   */
  conversao(janela: JanelaDeMetrica): Promise<Conversao>;

  /** ANA-10 — de `aberto_em` a `fechado_em`, so os que fecharam. */
  tempoDeAtendimento(janela: JanelaDeMetrica): Promise<MediaDeTempo>;

  /**
   * ANA-14 — os pares de primeira resposta, um por atendimento.
   *
   * So o PRIMEIRO par de cada atendimento, pela mesma razao do ANA-09: e o
   * primeiro "oi" que faz a cliente desistir, e trinta trocas rapidas depois
   * nao consertam uma espera de dois dias no comeco.
   */
  paresDeResposta(janela: JanelaDeMetrica): Promise<ParDeResposta[]>;

  /** ANA-14 — ganhos e perdidos por vendedora, para ranquear conversao. */
  desfechoPorVendedora(janela: JanelaDeMetrica): Promise<DesfechoDaVendedora[]>;

  /** ANA-11 — o mesmo, restrito aos que fecharam em VENDA. */
  tempoAteFecharVenda(janela: JanelaDeMetrica): Promise<MediaDeTempo>;
}

export const METRICAS_ATENDIMENTO_REPOSITORY = Symbol(
  'IMetricasAtendimentoRepository',
);
