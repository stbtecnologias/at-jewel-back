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
 * vendedora ou WAHA: recebe nivel, titulo e linhas. Para servir outro sistema
 * basta copia-lo e trocar `TELEGRAM_SISTEMA` — o prefixo entre colchetes e o
 * que diz de onde o aviso veio quando o mesmo bot atende varios projetos.
 *
 * NASCE DESLIGADO. `TELEGRAM_ALERTAS_ATIVOS` e o interruptor, pelo mesmo
 * motivo do `AlertasScheduler`: este e um dos dois lugares da casa que falam
 * com gente sem ninguem ter pedido. Desligado, ele REGISTRA EM LOG o que
 * mandaria — e e assim que se mede o barulho real antes de deixar sair.
 * ==========================================================================
 */

export type NivelDoAviso = 'bom' | 'atencao' | 'ruim' | 'neutro';

/** O envio HTTP, injetavel para o teste nao sair para a rede. */
export type EnvioHttp = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
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
 * segurar o ouvinte — que esta esperando esta promessa.
 */
const ESPERAS_MS = [100, 300];

/**
 * O NOME DA VENDEDORA E DADO DE FORA. Com `parse_mode: HTML`, um `<` solto
 * faz o Telegram recusar a mensagem inteira com 400 — e o aviso some.
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
  async enviar(
    nivel: NivelDoAviso,
    titulo: string,
    linhas: string[],
  ): Promise<boolean> {
    const texto = this.montar(nivel, titulo, linhas);
    const resumo = this.resumo(nivel, titulo, linhas);

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
        `TELEGRAM_ALERTAS_ATIVOS=true sem token ou sem chat. Nao enviado: ${titulo}`,
      );
      return true;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const corpo = JSON.stringify({
      chat_id: chat,
      text: texto,
      parse_mode: 'HTML',
    });

    for (let i = 0; i < ESPERAS_MS.length + 1; i++) {
      try {
        const r = await this.envio(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: corpo,
        });
        if (r.ok) return true;
        this.logger.warn(`Telegram devolveu ${r.status} em "${titulo}".`);
      } catch (err) {
        this.logger.warn(
          `Falha de rede ao avisar "${titulo}": ${err instanceof Error ? err.message : String(err)}`,
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
   * A HIERARQUIA E FEITA COM O QUE O TELEGRAM RESPEITA — 10/11/2026.
   *
   * A primeira versao recuava as linhas de detalhe com tres espacos. Visto na
   * tela do celular, o Telegram praticamente nao mostra espaco a esquerda: o
   * que era para ser hierarquia virava tres linhas iguais.
   *
   * Entao: NEGRITO no titulo, que e o que aparece na previa da notificacao e
   * e a unica coisa que a pessoa le quando o celular esta na mao de alguem;
   * ITALICO na primeira linha de detalhe, que e o contexto (estado, numero,
   * hora); e o resto em texto normal, que e onde mora o que fazer.
   *
   * O prefixo `[<SISTEMA>]` fica ANTES do titulo, e nao depois, porque o mesmo
   * bot vai atender mais de um projeto — quem le precisa saber de onde veio
   * antes de ler o que aconteceu.
   */
  private montar(
    nivel: NivelDoAviso,
    titulo: string,
    linhas: string[],
  ): string {
    const sistema = this.config.get<string>('TELEGRAM_SISTEMA') ?? '';
    const partes = [`${ICONE[nivel]} [${sistema}] <b>${esc(titulo)}</b>`];
    if (linhas.length > 0) partes.push(`<i>${esc(linhas[0])}</i>`);
    for (const l of linhas.slice(1)) partes.push(esc(l));
    return partes.join('\n');
  }

  /** A mesma coisa sem marcacao, para o log nao ficar cheio de etiqueta. */
  private resumo(
    nivel: NivelDoAviso,
    titulo: string,
    linhas: string[],
  ): string {
    const sistema = this.config.get<string>('TELEGRAM_SISTEMA') ?? '';
    return [`${ICONE[nivel]} [${sistema}] ${titulo}`, ...linhas].join(' | ');
  }
}
