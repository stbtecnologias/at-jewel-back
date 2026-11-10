import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * ==========================================================================
 * O AVISO QUE SAI POR OUTRO CANAL — 10/11/2026.
 *
 * Avisar pelo WhatsApp que o WhatsApp caiu e justamente o que nao funciona na
 * hora que importa. O alarme nao pode dividir destino com o que ele vigia.
 *
 * ESTE ARQUIVO E PORTATIL DE PROPOSITO. Ele nao sabe o que e sessao, joia,
 * vendedora ou WAHA: recebe um `Aviso` em partes e monta a mensagem. Para
 * servir outro sistema basta copia-lo e trocar `TELEGRAM_SISTEMA` — o nome
 * entre colchetes, DENTRO do negrito, e o que diz de onde o aviso veio ja na
 * previa da notificacao, que muitas vezes e tudo o que se le.
 *
 * O FORMATO FOI MEDIDO CONTRA O TELEGRAM DE VERDADE, e nao suposto:
 * `blockquote`, `code`, hashtag e `disable_notification` foram os quatro
 * aceitos numa sondagem em 10/11. A primeira versao recuava as linhas de
 * detalhe com tres espacos — e a tela do celular mostrou que o Telegram
 * praticamente nao exibe espaco a esquerda: o que era hierarquia virava tres
 * linhas iguais.
 *
 * NASCE DESLIGADO. `TELEGRAM_ALERTAS_ATIVOS` e o interruptor, pelo mesmo
 * motivo do `AlertasScheduler`: este e um dos dois lugares da casa que falam
 * com gente sem ninguem ter pedido. Desligado, ele REGISTRA EM LOG o que
 * mandaria — e e assim que se mede o barulho real antes de deixar sair.
 * ==========================================================================
 */

export type NivelDoAviso = 'bom' | 'atencao' | 'ruim' | 'neutro';

/** Uma linha do bloco de detalhe. Com `valor`, ele sai em monoespacado. */
export interface LinhaDoBloco {
  rotulo: string;
  valor?: string;
}

export interface Aviso {
  /** Primeira linha, em negrito, depois do icone e do nome do sistema. */
  titulo: string;
  /** Linha menor logo abaixo — a funcao de quem e o aviso. */
  subtitulo?: string;
  /** Viram hashtag, para filtrar o historico com um toque. Sem `#`. */
  etiquetas?: string[];
  /** O dado tecnico, separado da mensagem humana. */
  bloco?: LinhaDoBloco[];
  /** O que fazer. Texto normal, no fim. */
  recado?: string;
  /** Notícia boa nao precisa tocar. */
  silencioso?: boolean;
}

/** O envio HTTP, injetavel para o teste nao sair para a rede. */
export type EnvioHttp = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number }>;

const ICONE: Record<NivelDoAviso, string> = {
  bom: '🟢',
  atencao: '🟡',
  ruim: '🔴',
  neutro: '⚪',
};

/**
 * Tres tentativas, com espera curta entre elas.
 *
 * O numero sai do que se perde: sem tabela, aviso que nao sai some para
 * sempre. Duas esperas curtas cobrem o soluco de rede e o 429 esporadico sem
 * segurar quem esta esperando esta promessa.
 */
const ESPERAS_MS = [100, 300];

/**
 * O `fetch` do Node NAO tem prazo total — so um limite por cabecalho/corpo,
 * de ~300 s. Com o Telegram alcancavel mas mudo (proxy travado, DNS preso),
 * tres tentativas levariam ate QUINZE MINUTOS para desistir, e o log de "nao
 * enviado" — unico registro de que o aviso existiu — chegaria depois disso.
 */
const PRAZO_MS = 10_000;

/**
 * COM `parse_mode: HTML`, UM `<` SOLTO DERRUBA A MENSAGEM INTEIRA (400). E
 * tudo o que entra aqui vem de fora: nome de vendedora, nome do sistema.
 */
function esc(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const envioPadrao: EnvioHttp = async (url, init) => {
  const r = await fetch(url, init);
  return { ok: r.ok, status: r.status };
};

const espera = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

@Injectable()
export class TelegramClient {
  private readonly logger = new Logger(TelegramClient.name);

  constructor(
    private readonly config: ConfigService,
    private readonly envio: EnvioHttp = envioPadrao,
  ) {}

  /**
   * Manda o aviso. NUNCA estoura para cima.
   *
   * Devolve `false` so quando havia o que enviar e nao saiu. Desligado ou sem
   * configuracao devolve `true`: nada falhou, e so nao era para falar.
   */
  async enviar(nivel: NivelDoAviso, aviso: Aviso): Promise<boolean> {
    const texto = this.montar(nivel, aviso);
    const resumo = this.resumo(nivel, aviso);

    const ativo = this.config.get<string>('TELEGRAM_ALERTAS_ATIVOS') === 'true';
    if (!ativo) {
      this.logger.log(`[desligado, nao enviado] ${resumo}`);
      return true;
    }

    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? '';
    const chat = this.config.get<string>('TELEGRAM_CHAT_ID') ?? '';
    if (!token || !chat) {
      // Ligado e sem configuracao e engano de quem subiu, nao desenho: avisa
      // alto, mas nao quebra nada.
      this.logger.warn(
        `TELEGRAM_ALERTAS_ATIVOS=true sem token ou sem chat. Nao enviado: ${aviso.titulo}`,
      );
      return true;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const corpo = JSON.stringify({
      chat_id: chat,
      text: texto,
      parse_mode: 'HTML',
      disable_notification: aviso.silencioso === true,
    });

    for (let i = 0; i < ESPERAS_MS.length + 1; i++) {
      try {
        const r = await this.envio(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: corpo,
          signal: AbortSignal.timeout(PRAZO_MS),
        });
        if (r.ok) return true;
        this.logger.warn(`Telegram devolveu ${r.status} em "${aviso.titulo}".`);
      } catch (err) {
        this.logger.warn(
          `Falha de rede ao avisar "${aviso.titulo}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (i < ESPERAS_MS.length) await espera(ESPERAS_MS[i]);
    }

    // A ultima linha de defesa: sem tabela, este log e o unico lugar onde o
    // aviso perdido ainda existe.
    this.logger.error(`AVISO NAO ENVIADO: ${resumo}`);
    return false;
  }

  /**
   * A HIERARQUIA E FEITA COM O QUE O TELEGRAM RESPEITA.
   *
   * NEGRITO no titulo, que e o que aparece na previa da notificacao e a unica
   * coisa que se le com o celular na mao de alguem — e o nome do sistema vai
   * DENTRO dele, para a previa dizer de onde veio. Hashtag na linha de baixo,
   * que filtra o historico com um toque. `blockquote` separando o dado
   * tecnico da mensagem humana, e `code` no valor, que sai monoespacado e
   * copia com um toque.
   */
  private montar(nivel: NivelDoAviso, aviso: Aviso): string {
    const sistema = this.config.get<string>('TELEGRAM_SISTEMA') ?? '';
    const partes = [
      `${ICONE[nivel]} <b>[${esc(sistema)}] ${esc(aviso.titulo)}</b>`,
    ];

    const segunda = [
      aviso.subtitulo ? esc(aviso.subtitulo) : null,
      aviso.etiquetas?.length
        ? aviso.etiquetas.map((e) => `#${esc(e)}`).join(' ')
        : null,
    ].filter((x): x is string => x !== null);
    if (segunda.length) partes.push(segunda.join(' · '));

    if (aviso.bloco?.length) {
      const linhas = aviso.bloco.map((l) =>
        l.valor === undefined
          ? esc(l.rotulo)
          : `${esc(l.rotulo)}: <code>${esc(l.valor)}</code>`,
      );
      // LINHA EM BRANCO ANTES DO BLOCO, pedido do Lucas depois de ver na tela:
      // colado, o dado tecnico competia com o titulo em vez de apoia-lo.
      partes.push('', `<blockquote>${linhas.join('\n')}</blockquote>`);
    }

    if (aviso.recado) partes.push(esc(aviso.recado));

    return partes.join('\n');
  }

  /** A mesma coisa sem marcacao, para o log nao ficar cheio de etiqueta. */
  private resumo(nivel: NivelDoAviso, aviso: Aviso): string {
    const sistema = this.config.get<string>('TELEGRAM_SISTEMA') ?? '';
    const bloco = (aviso.bloco ?? []).map((l) =>
      l.valor === undefined ? l.rotulo : `${l.rotulo}: ${l.valor}`,
    );
    return [
      `${ICONE[nivel]} [${sistema}] ${aviso.titulo}`,
      aviso.subtitulo,
      ...bloco,
      aviso.recado,
    ]
      .filter(Boolean)
      .join(' | ');
  }
}
