import { Injectable } from '@nestjs/common';
import { limparEHigienizar } from '../../../shared/http/sanitize/sanitize-text.transform';

/** Quantas linhas de cada grupo ficam guardadas. */
export const LINHAS_POR_GRUPO = 10;

/** Quanto tempo a sala "lembra". Passou disso, comeca do zero. */
export const TTL_MS = 30 * 60 * 1000;

/** Teto por linha, para uma mensagem enorme nao inchar o prompt sozinha. */
const MAX_CARACTERES = 400;

interface Linha {
  /** `PushName` de quem escreveu, ou nulo. E dado, nunca instrucao. */
  quem: string | null;
  texto: string;
  em: number;
}

/**
 * O QUE FOI DITO NO GRUPO ANTES DE ELA SER CHAMADA — 30/09/2026.
 *
 * ==========================================================================
 * NASCEU DE UM TESTE QUE PARECIA DEFEITO E ERA A REGRA FUNCIONANDO.
 *
 * O Lucas perguntou "qual o faturamento da semana?" e, na mensagem seguinte,
 * mencionou a Anastasia. Ela respondeu pedindo a pergunta — porque a primeira
 * mensagem, sem mencao, tinha sido descartada na primeira linha do roteador.
 * Correto pela regra, e inutil para quem estava olhando: "da para saber o que
 * eu quero", ele disse, e dava.
 *
 * Agora ela OUVE A SALA: toda mensagem do grupo entra aqui, SEM chamar o
 * modelo e sem reconhecer ninguem. Quando alguem menciona, estas linhas vao
 * junto como contexto.
 * ==========================================================================
 *
 * CONTINUA CUSTANDO ZERO ENQUANTO NINGUEM CHAMAR: guardar e uma escrita em
 * memoria. O gasto so existe na mencao, e ai e um prompt um pouco maior.
 *
 * ==========================================================================
 * SO EM RAM, E COM PRAZO. NADA DISTO VAI PARA O BANCO.
 *
 * E conversa de gente, guardada para uma pergunta que talvez nem venha.
 * Persistir transformaria uma conveniencia num arquivo de tudo que a equipe
 * conversa — que ninguem pediu e ninguem quer manter.
 *
 * O restart apaga, e esta certo assim: quem chamar depois recomeca do que
 * estiver na tela.
 * ==========================================================================
 */
@Injectable()
export class MemoriaDeGrupoService {
  private readonly salas = new Map<string, { linhas: Linha[]; em: number }>();

  /**
   * Guarda o que foi dito. Chamado para TODA mensagem de grupo, mencionada ou
   * nao — e a mencionada tambem entra, senao o proprio pedido sumiria do fio.
   */
  registrar(chatId: string, quem: string | null, texto: string): void {
    // ====================================================================
    // HIGIENE ANTES DE GUARDAR — 30/09/2026.
    //
    // Ate aqui era so `trim` e corte. Caractere de controle, zero-width e
    // inversao de direcao de texto passavam inteiros para o prompt, e sao o
    // jeito de confundir a leitura sem escrever nada que pareca comando.
    //
    // A defesa principal do bloco e o delimitador sorteado, em
    // `contextoDeGrupo`. Esta aqui e a camada de baixo, e vale para os dois
    // campos: o texto e o nome que a pessoa escolheu no WhatsApp.
    // ====================================================================
    const limpo = limparEHigienizar(texto).trim().slice(0, MAX_CARACTERES);
    if (!limpo) return;

    const agora = Date.now();
    const sala = this.viva(chatId, agora) ?? { linhas: [], em: agora };
    // O `quem` e o PushName — escolhido pela propria pessoa, e por isso passa
    // pelo mesmo tratamento do texto. Vazio depois da limpeza vira `null`, e a
    // linha sai sem prefixo em vez de sair com um prefixo em branco.
    const nome = quem ? limparEHigienizar(quem).trim() || null : null;
    sala.linhas.push({ quem: nome, texto: limpo, em: agora });
    // Só as ultimas: a sala e um retrovisor, nao um historico.
    if (sala.linhas.length > LINHAS_POR_GRUPO) {
      sala.linhas = sala.linhas.slice(-LINHAS_POR_GRUPO);
    }
    sala.em = agora;
    this.salas.set(chatId, sala);
  }

  /**
   * As linhas anteriores, prontas para virar contexto. Vazio quando nao ha
   * nada guardado ou quando a sala ja esfriou.
   *
   * `exceto` deixa de fora a mensagem que ACABOU de chegar — ela ja vai como
   * a pergunta, e apareceria duas vezes.
   */
  anteriores(chatId: string, exceto: number): string[] {
    const sala = this.viva(chatId, Date.now());
    if (!sala) return [];
    return sala.linhas
      .slice(0, Math.max(0, sala.linhas.length - exceto))
      .map((l) => (l.quem ? `${l.quem}: ${l.texto}` : l.texto));
  }

  /** Depois de responder, a sala recomeca? Nao — so o TTL apaga. */
  private viva(
    chatId: string,
    agora: number,
  ): { linhas: Linha[]; em: number } | null {
    const sala = this.salas.get(chatId);
    if (!sala) return null;
    if (agora - sala.em > TTL_MS) {
      this.salas.delete(chatId);
      return null;
    }
    return sala;
  }
}
