import { Injectable } from '@nestjs/common';

/**
 * Memoria do MENU que acabou de sair — o que faz o "1" ter significado.
 *
 * ==========================================================================
 * SO O MENU DA SENTIDO AO NUMERO, E SO POR POUCO TEMPO.
 *
 * Um "1" solto no canal interno nao quer dizer nada por si. Ele so e escolha
 * enquanto a pessoa tem a lista na tela — dez minutos depois, o mesmo "1"
 * pode ser resposta a outra coisa, ou engano.
 *
 * A JANELA E CURTA DE PROPOSITO, e menor que a do catalogo (30 min): a
 * sessao de catalogo guarda TRABALHO — foto no disco esperando o numero do
 * catalogo —, e perde-la custa caro. Aqui se guarda so a ultima pergunta
 * feita; perder e mandar "oi" de novo.
 * ==========================================================================
 *
 * Map em memoria, como a sessao do catalogo e a memoria de conversa dos
 * agentes: processo unico, janela curta, nada que valha um Redis.
 */

/** Quanto tempo o numero do menu continua valendo. */
const JANELA_MS = 10 * 60 * 1000;

/**
 * Teto de menus lembrados ao mesmo tempo.
 *
 * O canal interno tem dezenas de telefones, nao milhares — o teto existe
 * para o caso patologico, nao para o uso normal. Ao encher, sai o menu mais
 * antigo, que e o mais perto de vencer de qualquer forma.
 */
const MAX_MENUS = 200;

/** O que acontece quando a pessoa responde este numero. */
export type AcaoMenu =
  /** Abre a conversa do catalogo, como quem escreve "quero mandar foto". */
  | { tipo: 'catalogo_foto' }
  /** Pergunta qual peca, e responde com descricao e preco. */
  | { tipo: 'catalogo_consulta' }
  /** Lista os catalogos abertos. */
  | { tipo: 'catalogo_abertos' }
  /**
   * A frase que a pessoa teria escrito, entregue ao agente dela.
   *
   * E O QUE IMPEDE O MENU DE VIRAR UM SEGUNDO SISTEMA. A Elena e a Anastasia
   * ja sabem responder "como estao minhas vendas hoje?" — o menu nao repete
   * nenhuma regra, so escreve a pergunta por quem esta no celular.
   */
  | { tipo: 'frase'; texto: string };

export interface OpcaoMenu {
  /** Como a linha aparece: "1 — Minhas vendas". */
  rotulo: string;
  acao: AcaoMenu;
}

interface MenuOferecido {
  opcoes: OpcaoMenu[];
  em: number;
}

/** Numero sozinho, com o "#" opcional que o WhatsApp convida a digitar. */
const RE_SO_NUMERO = /^#?([1-9])$/;

@Injectable()
export class RecepcaoService {
  private readonly menus = new Map<string, MenuOferecido>();

  /** Guarda o menu que acabou de sair. Substitui o anterior. */
  oferecer(chave: string, opcoes: OpcaoMenu[]): void {
    this.limparVencidos();
    if (this.menus.size >= MAX_MENUS && !this.menus.has(chave)) {
      const maisAntigo = this.menus.keys().next();
      if (!maisAntigo.done) this.menus.delete(maisAntigo.value);
    }
    this.menus.set(chave, { opcoes, em: Date.now() });
  }

  /**
   * O texto e a escolha de um menu vivo? `null` quando nao e.
   *
   * SO O NUMERO SOZINHO CONTA. "1" e escolha; "1 peca de ouro" e frase, e
   * segue o caminho normal. Numero fora da lista tambem devolve `null` — com
   * o menu de tres linhas, um "7" nao e escolha, e quem responde e o canal de
   * sempre.
   */
  escolhida(chave: string, texto: string): OpcaoMenu | null {
    const menu = this.vivo(chave);
    if (!menu) return null;

    const m = texto.trim().match(RE_SO_NUMERO);
    if (!m) return null;

    const i = Number(m[1]);
    if (i < 1 || i > menu.opcoes.length) return null;

    // O MENU MORRE NA ESCOLHA. A partir daqui quem manda na conversa e o
    // fluxo escolhido — e o "1" que vier depois e resposta a ELE, nao ao
    // menu. E o mesmo cuidado do `escolha` da sessao do catalogo.
    this.menus.delete(chave);
    return menu.opcoes[i - 1];
  }

  /** Esquece o menu deste remetente. */
  esquecer(chave: string): void {
    this.menus.delete(chave);
  }

  private vivo(chave: string): MenuOferecido | null {
    const menu = this.menus.get(chave);
    if (!menu) return null;
    if (Date.now() - menu.em > JANELA_MS) {
      this.menus.delete(chave);
      return null;
    }
    return menu;
  }

  private limparVencidos(): void {
    const agora = Date.now();
    for (const [chave, menu] of this.menus) {
      if (agora - menu.em > JANELA_MS) this.menus.delete(chave);
    }
  }
}
