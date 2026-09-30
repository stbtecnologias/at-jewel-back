/**
 * PENDENTE -> ENVIADO | CANCELADO | PERDIDO.
 *
 * `PERDIDO` e o lembrete que o processo ficou fora do ar tempo demais para
 * entregar. Ele nao some da listagem: lembrete que desaparece calado e
 * exatamente a falha que esta funcionalidade existe para evitar.
 */
export type EstadoLembrete = 'PENDENTE' | 'ENVIADO' | 'CANCELADO' | 'PERDIDO';

/** Um lembrete do ponto de vista do DONO. Nao carrega o id do dono: quem le ja e ele. */
export interface Lembrete {
  id: string;
  texto: string;
  quando: Date;
  estado: EstadoLembrete;
}

/** A forma que o CRON ve — a unica que carrega o dono, porque e ela que decide para quem mandar. */
export interface LembreteVencido {
  id: string;
  donoId: string;
  texto: string;
  quando: Date;
}

/**
 * O REPOSITORIO DE LEMBRETES PESSOAIS.
 *
 * ==========================================================================
 * NAO EXISTE CONSULTA SEM DONO, E ESSA E A BARREIRA.
 *
 * Todo metodo de leitura e de escrita da pessoa recebe `donoId`, e ele entra
 * no WHERE — nao num `if` depois. Nao ha `listarTodos`, nao ha `buscarPorId`
 * solto, e nao ha parametro "de quem" em ferramenta nenhuma: o `donoId` chega
 * por closure, do telefone ja reconhecido.
 *
 * E deliberado, e o motivo esta na auditoria de 30/09/2026: quatro achados
 * daquele dia eram a mesma forma de erro — recorte aplicado num caminho e
 * esquecido no vizinho. Um filtro que precisa ser lembrado sera esquecido.
 * Um metodo que nao existe, nao.
 *
 * `vencidos` e a unica excecao, e por isso ela devolve um tipo PROPRIO: ela
 * nao responde "quais sao os de fulano", responde "quais venceram" — e quem a
 * chama e o cron, que nao tem usuario.
 * ==========================================================================
 */
export interface ILembretesRepository {
  /** Guarda um lembrete novo. Devolve o que ficou gravado. */
  guardar(donoId: string, texto: string, quando: Date): Promise<Lembrete>;

  /**
   * Os lembretes que ainda importam para o dono: PENDENTE e PERDIDO, do mais
   * proximo para o mais distante.
   *
   * ENVIADO e CANCELADO ficam de fora — a lista e "o que ainda vai acontecer
   * ou falhou", nao um historico. Historico sem ninguem pedir e ruido, e a
   * lista precisa caber numa mensagem de WhatsApp.
   */
  listar(donoId: string): Promise<Lembrete[]>;

  /** Quantos PENDENTES o dono tem. Serve ao teto — ver `LembretesService`. */
  contarPendentes(donoId: string): Promise<number>;

  /**
   * Muda a hora. `PERDIDO` remarcado volta a `PENDENTE` — e o caso de "perdi
   * aquele, joga para amanha".
   *
   * `false` quando o id nao e do dono ou ja foi enviado/cancelado, e quem
   * chama usa isso para nao dizer "remarquei" sobre algo que nao remarcou.
   */
  remarcar(id: string, donoId: string, quando: Date): Promise<boolean>;

  /** Cancela. Mesmo contrato do `remarcar` quanto ao `false`. */
  cancelar(id: string, donoId: string): Promise<boolean>;

  /**
   * O que venceu, mais atrasado primeiro — a pergunta do cron.
   *
   * A ordem importa: quando o processo volta de uma queda, o lote de 50 tem de
   * comecar pelos que esperam ha mais tempo, senao os mais antigos ficariam
   * para tras a cada rodada e so eles virariam PERDIDO.
   */
  vencidos(agora: Date, limite: number): Promise<LembreteVencido[]>;

  /** Fecha o lembrete num estado terminal. Sem dono: quem chama e o cron. */
  fechar(id: string, estado: 'ENVIADO' | 'PERDIDO'): Promise<void>;
}
