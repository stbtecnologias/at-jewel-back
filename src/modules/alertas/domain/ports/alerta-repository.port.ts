/**
 * OS ALERTAS PROATIVOS — ANA-19, ANA-20 e ANA-21.
 *
 * ==========================================================================
 * UM ALERTA NAO E UMA CONSULTA QUE ALGUEM FAZ: E UMA MENSAGEM QUE CHEGA NO
 * TELEFONE DE UMA PESSOA SEM ELA TER PEDIDO.
 *
 * Isso muda tudo no desenho. Uma consulta errada e um numero que ninguem usa;
 * um alerta errado acorda alguem as 6h da manha, e depois de tres desses o
 * quarto — que era o importante — ja nao e lido.
 *
 * Por isso as tres pecas nascem juntas e nenhuma sozinha:
 *
 *   ANA-19  o alerta dispara
 *   ANA-20  o prazo e configuravel, e o alerta pode ser DESLIGADO
 *   ANA-21  o que ja foi avisado fica registrado, e nao se repete
 *
 * Ligar o 19 sem o 21 seria construir um repetidor: a varredura roda de hora
 * em hora e o mesmo lead parado geraria um aviso por rodada, para sempre.
 * ==========================================================================
 */

export interface RegraDeAlerta {
  chave: string;
  descricao: string;
  ativo: boolean;
  /** Quanto tempo de espera antes de o alerta valer. */
  prazoMinutos: number;
  /**
   * Quanto esperar antes de avisar DE NOVO sobre a mesma coisa.
   *
   * `null` = avisa uma vez so. Aviso de urgencia repetido nao acrescenta
   * informacao: quem nao agiu na primeira nao age na terceira, e o ruido faz
   * o proximo ser ignorado.
   */
  repetirAposMinutos: number | null;
}

/** O que um alerta avisa: um lead, uma vendedora, ou a loja. */
export type TipoDeAlvo = 'LEAD' | 'VENDEDORA' | 'LOJA';

export interface DisparoDeAlerta {
  regra: string;
  alvoTipo: TipoDeAlvo;
  alvoId: string;
  destinatario: string | null;
}

/** Um lead que passou do prazo — o candidato bruto, antes do anti-repeticao. */
export interface LeadEmAtraso {
  leadId: string;
  nome: string | null;
  /** O telefone CIFRADO continua cifrado aqui: quem envia decifra. */
  vendedoraCodigo: string | null;
  vendedoraNome: string | null;
  desde: Date;
  minutosParado: number;
}

export interface IAlertaRepository {
  /** ANA-20 — as regras como estao configuradas agora. */
  listarRegras(): Promise<RegraDeAlerta[]>;

  /** ANA-20 — a gestao muda o prazo ou desliga o alerta. */
  atualizarRegra(
    chave: string,
    mudanca: Partial<Pick<RegraDeAlerta, 'ativo' | 'prazoMinutos' | 'repetirAposMinutos'>>,
  ): Promise<RegraDeAlerta | null>;

  /**
   * ANA-04 — leads em `NOVO` ha mais tempo que o prazo.
   *
   * O ESTADO E QUEM DIZ, e nao um calculo sobre mensagens: `NOVO` significa
   * exatamente "ninguem respondeu ainda" desde o funil de 29/09. Reimplementar
   * a pergunta aqui criaria uma segunda definicao de "sem resposta", e as duas
   * divergiriam no primeiro caso de borda.
   */
  leadsSemResposta(limite: Date): Promise<LeadEmAtraso[]>;

  /** ANA-19 — leads que ja foram marcados `PARADO` pela varredura. */
  leadsParados(limite: Date): Promise<LeadEmAtraso[]>;

  /**
   * ANA-21 — este alvo ja foi avisado por esta regra, dentro da janela?
   *
   * `janelaMinutos` nulo significa "alguma vez": e o caso do alerta que avisa
   * uma vez so.
   */
  jaAvisou(
    regra: string,
    alvoTipo: TipoDeAlvo,
    alvoId: string,
    janelaMinutos: number | null,
  ): Promise<boolean>;

  /** ANA-21 — registra o envio. Chamado DEPOIS de enviar, nunca antes. */
  registrarDisparo(disparo: DisparoDeAlerta): Promise<void>;
}

export const ALERTA_REPOSITORY = Symbol('IAlertaRepository');
