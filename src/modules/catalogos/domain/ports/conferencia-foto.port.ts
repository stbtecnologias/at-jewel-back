import type { ImagemDeEntrada } from './tratamento-imagem.port';

/**
 * A conferencia da foto ANTES de tratar.
 *
 * ==========================================================================
 * POR QUE ISTO EXISTE — 15/09/2026.
 *
 * O Lucas mandou pelo WhatsApp a foto do canto de um notebook. O tratamento
 * devolveu uma FERRADURA de metal, bem iluminada, sobre fundo branco. Nao
 * havia ferradura nenhuma na foto: o modelo inventou uma peca.
 *
 * A CAUSA E O ENDPOINT, e nao o prompt. `/v1/images/edits` REGERA a imagem, e
 * a resposta dele e sempre uma imagem — nao existe "nao entendi" naquela
 * rota. Sem peca reconhecivel na entrada, ele produz a peca mais provavel.
 *
 * Entao a recusa tem de acontecer ANTES, e por outro caminho: um modelo que
 * OLHA a foto e responde em texto se ha uma peca ali.
 * ==========================================================================
 *
 * O QUE ELA NAO E: um juiz de qualidade de foto. Foto tremida, escura ou de
 * longe continua passando — o tratamento existe justamente para isso. O que
 * ela barra e a foto que NAO TEM PECA, onde o modelo inventaria uma.
 *
 * NA DUVIDA, PASSA. Um falso "nao serve" tira do estoque o direito de mandar
 * a foto que eles mandam todo dia; um falso "serve" custa uma geracao e cai
 * na aprovacao humana, que continua sendo a rede de seguranca.
 */

export type MotivoRecusa =
  /** Nao ha joia nenhuma na imagem — o caso do notebook. */
  | 'sem_peca'
  /** Ha varias pecas, e o packshot e de uma. */
  | 'varias_pecas';

export interface VereditoFoto {
  serve: boolean;
  /** So quando `serve` e falso. */
  motivo?: MotivoRecusa;
  /**
   * O que o modelo diz ter visto ("um teclado de notebook"), para a resposta
   * dizer a verdade em vez de um "nao entendi" generico. Pode faltar.
   */
  viu?: string | null;
}

export interface IConferenciaFoto {
  /** Sem chave configurada, a conferencia nao roda e o fluxo segue igual. */
  disponivel(): boolean;

  /**
   * Devolve o veredito, ou `null` quando NAO FOI POSSIVEL conferir — timeout,
   * cota, provedor fora do ar.
   *
   * `null` nao e "nao serve": e "nao sei". Quem chama trata os dois de forma
   * diferente, e e essa distincao que impede uma indisponibilidade do provedor
   * de derrubar o canal do catalogo inteiro.
   */
  conferir(imagem: ImagemDeEntrada): Promise<VereditoFoto | null>;
}
