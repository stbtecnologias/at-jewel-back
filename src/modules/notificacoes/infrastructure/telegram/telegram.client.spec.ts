import type { ConfigService } from '@nestjs/config';
import { TelegramClient, type EnvioHttp } from './telegram.client';

/**
 * ==========================================================================
 * O CANAL QUE NAO COMPARTILHA DESTINO COM O QUE ELE VIGIA — 10/11/2026.
 *
 * O aviso de que o WhatsApp caiu nao pode sair pelo WhatsApp. Por isso
 * Telegram, e por isso este arquivo nao sabe o que e uma joia, uma vendedora
 * ou uma sessao: ele recebe um aviso em partes e monta a mensagem. E o
 * arquivo que vai ser COPIADO para outros sistemas, entao o contrato dele
 * nasce aqui e viaja.
 *
 * O FORMATO FOI MEDIDO CONTRA O TELEGRAM DE VERDADE em 10/11: `blockquote`,
 * `code`, hashtag e `disable_notification` sao todos aceitos. O recuo por
 * espaco, que era a primeira versao, NAO aparece — foi o que a tela do
 * celular mostrou.
 *
 * NASCE DESLIGADO, como o `AlertasScheduler` — o unico outro lugar da casa
 * que fala com gente sem ninguem ter pedido.
 * ==========================================================================
 */

const LIGADO: Record<string, string> = {
  TELEGRAM_ALERTAS_ATIVOS: 'true',
  TELEGRAM_BOT_TOKEN: 'tok',
  TELEGRAM_CHAT_ID: '42',
  TELEGRAM_SISTEMA: 'A.T JEWEL',
};

const cfg = (v: Record<string, string>): ConfigService =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService;

interface Corpo {
  chat_id?: string;
  text?: string;
  parse_mode?: string;
  disable_notification?: boolean;
}

function espiao(): { envio: EnvioHttp; corpo: () => Corpo; chamadas: () => number } {
  let corpo: Corpo = {};
  let chamadas = 0;
  const envio: EnvioHttp = async (_u, i) => {
    chamadas++;
    corpo = JSON.parse(i.body) as Corpo;
    return { ok: true, status: 200 };
  };
  return { envio, corpo: () => corpo, chamadas: () => chamadas };
}

describe('TelegramClient', () => {
  it('monta o aviso inteiro no formato medido', async () => {
    const e = espiao();

    await new TelegramClient(cfg(LIGADO), e.envio).enviar('ruim', {
      titulo: 'Anastasia caiu',
      subtitulo: 'gestão',
      etiquetas: ['falha'],
      bloco: [
        { rotulo: 'Estado', valor: 'FAILED' },
        { rotulo: 'Desde 16:02' },
      ],
      recado: 'Precisa reconectar pelo painel.',
    });

    expect(e.corpo().chat_id).toBe('42');
    expect(e.corpo().parse_mode).toBe('HTML');
    // A LINHA EM BRANCO ANTES DO BLOCO e pedido do Lucas depois de ver na
    // tela: colado, o dado tecnico competia com o titulo.
    expect(e.corpo().text).toBe(
      '🔴 <b>[A.T JEWEL] Anastasia caiu</b>\n' +
        'gestão · #falha\n' +
        '\n' +
        '<blockquote>Estado: <code>FAILED</code>\n' +
        'Desde 16:02</blockquote>\n' +
        'Precisa reconectar pelo painel.',
    );
  });

  it('o aviso silencioso vai sem som', async () => {
    const e = espiao();

    await new TelegramClient(cfg(LIGADO), e.envio).enviar('bom', {
      titulo: 'Anastasia reconectada',
      silencioso: true,
    });

    expect(e.corpo().disable_notification).toBe(true);
  });

  it('o aviso comum toca', async () => {
    const e = espiao();

    await new TelegramClient(cfg(LIGADO), e.envio).enviar('ruim', {
      titulo: 'x',
    });

    expect(e.corpo().disable_notification).toBe(false);
  });

  it('so o titulo tambem e um aviso valido', async () => {
    const e = espiao();

    await new TelegramClient(cfg(LIGADO), e.envio).enviar('bom', {
      titulo: 'Tudo certo',
    });

    expect(e.corpo().text).toBe('🟢 <b>[A.T JEWEL] Tudo certo</b>');
  });

  /**
   * COM HTML, ESCAPAR DEIXA DE SER ZELO. O nome da vendedora vem de fora, e o
   * `TELEGRAM_SISTEMA` sai do `.env` e esta em TODA mensagem: um `<` solto
   * faria o Telegram recusar cada aviso com 400, para sempre.
   */
  it('escapa tudo o que vem de fora, inclusive o nome do sistema', async () => {
    const e = espiao();

    await new TelegramClient(
      cfg({ ...LIGADO, TELEGRAM_SISTEMA: 'A.T <prod>' }),
      e.envio,
    ).enviar('neutro', {
      titulo: 'ANA & <b>BIA</b> desconectada',
      bloco: [{ rotulo: 'Sessão', valor: 'vend-<x>' }],
    });

    expect(e.corpo().text).toBe(
      '⚪ <b>[A.T &lt;prod&gt;] ANA &amp; &lt;b&gt;BIA&lt;/b&gt; desconectada</b>\n' +
        '\n' +
        '<blockquote>Sessão: <code>vend-&lt;x&gt;</code></blockquote>',
    );
  });

  it('o interruptor desligado NAO envia, e devolve true', async () => {
    const e = espiao();

    const ok = await new TelegramClient(
      cfg({ ...LIGADO, TELEGRAM_ALERTAS_ATIVOS: 'false' }),
      e.envio,
    ).enviar('bom', { titulo: 'x' });

    expect(e.chamadas()).toBe(0);
    expect(ok).toBe(true);
  });

  it('sem token ou sem chat, nao envia', async () => {
    const e = espiao();

    await new TelegramClient(
      cfg({ ...LIGADO, TELEGRAM_BOT_TOKEN: '' }),
      e.envio,
    ).enviar('bom', { titulo: 'x' });

    expect(e.chamadas()).toBe(0);
  });

  it('tenta de novo quando falha, e devolve false quando nao sai', async () => {
    let tentativas = 0;
    const envio: EnvioHttp = async () => {
      tentativas++;
      return { ok: false, status: 429 };
    };

    const ok = await new TelegramClient(cfg(LIGADO), envio).enviar('ruim', {
      titulo: 'x',
    });

    expect(tentativas).toBe(3);
    expect(ok).toBe(false);
  });

  it('erro de rede nao estoura para cima', async () => {
    const envio: EnvioHttp = async () => {
      throw new Error('ECONNREFUSED');
    };

    await expect(
      new TelegramClient(cfg(LIGADO), envio).enviar('ruim', { titulo: 'x' }),
    ).resolves.toBe(false);
  });

  /**
   * O `fetch` do Node NAO tem prazo total — so um limite de ~300 s por
   * cabecalho/corpo. Com `api.telegram.org` alcancavel mas mudo, tres
   * tentativas levariam ate QUINZE MINUTOS para desistir, e o log de "nao
   * enviado" — unico registro de que o aviso existiu — chegaria depois.
   */
  it('o envio leva prazo, para nao ficar pendurado', async () => {
    let temPrazo = false;
    const envio: EnvioHttp = async (_u, i) => {
      temPrazo = (i as { signal?: unknown }).signal !== undefined;
      return { ok: true, status: 200 };
    };

    await new TelegramClient(cfg(LIGADO), envio).enviar('bom', { titulo: 'x' });

    expect(temPrazo).toBe(true);
  });
});
