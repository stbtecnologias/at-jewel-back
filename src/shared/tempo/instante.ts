/**
 * INSTANTE — ler e escrever "quando" em linguagem de gente.
 *
 * ==========================================================================
 * POR QUE ISTO SAIU DE DENTRO DO `agendar-contato-gestao`.
 *
 * As duas funcoes nasceram privadas la, em 21/08/2026, e sao as mesmas de que
 * o lembrete pessoal precisa: validar o ISO que o MODELO escreveu, e devolver
 * a hora numa frase que a pessoa reconheca.
 *
 * Copiar seria repetir a forma de erro que a auditoria de 30/09 achou quatro
 * vezes no projeto: a regra aplicada num caminho e esquecida no vizinho. No
 * dia em que o teto de meses mudasse, mudaria num lugar so — e ninguem
 * perceberia, porque as duas telas continuariam funcionando.
 * ==========================================================================
 */

/** O teto de quem agenda contato com cliente. Seis meses. */
export const DIAS_MAXIMOS_PADRAO = 180;

/**
 * POR QUE o instante nao serve — 08/10/2026.
 *
 * ==========================================================================
 * TRES MOTIVOS QUE PEDEM TRES FRASES DIFERENTES.
 *
 * O `interpretarInstante` devolve `null` para ilegivel, passado e distante, e
 * quem chamava dizia a mesma coisa nos tres: "precisa ser no futuro e dentro
 * de um ano, pergunte para quando e".
 *
 * Isso ficou errado quando a gestora passou a colar a agenda DO DIA. Ela
 * manda as 17h uma lista com "16h reuniao com os fornecedores", e a agente
 * pergunta "para quando e a reuniao das 16h?" — pergunta sem sentido, porque
 * a hora estava escrita ali. A resposta honesta e "essa ja passou, nao
 * guardei".
 *
 * PERGUNTAR o que nao se sabe esta certo; perguntar o que a pessoa acabou de
 * dizer parece que ninguem leu.
 * ==========================================================================
 */
export type MotivoDoInstante = 'OK' | 'ILEGIVEL' | 'PASSADO' | 'DISTANTE';

/**
 * A MESMA regra do `interpretarInstante`, dizendo qual ramo reprovou.
 *
 * Os dois compartilham esta funcao de proposito, e e o motivo pelo qual este
 * arquivo existe: a regra num lugar so, para nao mudar num caminho e ficar
 * esquecida no vizinho.
 */
export function motivoDoInstante(
  iso: string,
  diasMaximos: number = DIAS_MAXIMOS_PADRAO,
  agora: Date = new Date(),
): MotivoDoInstante {
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return 'ILEGIVEL';
  const base = agora.getTime();
  if (quando.getTime() < base) return 'PASSADO';
  if (quando.getTime() > base + diasMaximos * 24 * 60 * 60_000) {
    return 'DISTANTE';
  }
  return 'OK';
}

/**
 * Le o ISO 8601 que o modelo escreveu. `null` quando nao serve.
 *
 * Aceita apenas horario FUTURO e dentro do teto. Data no passado quase sempre
 * e o modelo errando o ano; data muito distante, alucinacao. Nos dois casos o
 * certo e devolver `null` e deixar quem chama perguntar de novo — nunca
 * corrigir por conta propria, porque a correcao seria um palpite apresentado
 * como combinado.
 *
 * Quem precisa saber QUAL dos tres motivos reprovou usa o `motivoDoInstante`
 * — ver o cabecalho dele.
 */
export function interpretarInstante(
  iso: string,
  diasMaximos: number = DIAS_MAXIMOS_PADRAO,
  agora: Date = new Date(),
): Date | null {
  return motivoDoInstante(iso, diasMaximos, agora) === 'OK'
    ? new Date(iso)
    : null;
}

/**
 * "hoje às 15:00", "amanhã às 09:00", "sexta-feira às 10:00", "12/10 às 08:00".
 *
 * A escolha da forma e por DISTANCIA e nao por formato fixo: quem le "hoje"
 * nao precisa conferir o calendario, e quem le "12/10" precisa — entao a data
 * seca so aparece quando ela e a unica que nao deixa duvida.
 */
export function quandoEmPalavras(d: Date, agora: Date = new Date()): string {
  const hora = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const soDia = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = (soDia(d) - soDia(agora)) / 86_400_000;

  if (dias === 0) return `hoje às ${hora}`;
  if (dias === 1) return `amanhã às ${hora}`;
  if (dias === -1) return `ontem às ${hora}`;
  if (dias > 1 && dias < 7) {
    return `${d.toLocaleDateString('pt-BR', { weekday: 'long' })} às ${hora}`;
  }
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
}
