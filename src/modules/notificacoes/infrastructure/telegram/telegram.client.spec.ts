import type { ConfigService } from '@nestjs/config';
import { TelegramClient, type EnvioHttp } from './telegram.client';

/**
 * ==========================================================================
 * O CANAL QUE NAO COMPARTILHA DESTINO COM O QUE ELE VIGIA — 10/11/2026.
 *
 * O aviso de que o WhatsApp caiu nao pode sair pelo WhatsApp. Por isso
 * Telegram, e por isso este arquivo nao sabe o que e uma joia, uma vendedora
 * ou uma sessao: ele recebe nivel, titulo e linhas, e poe o nome do sistema
 * na frente. E o arquivo que vai ser COPIADO para outros sistemas, entao o
 * contrato dele nasce aqui e viaja.
 *
 * NASCE DESLIGADO, como o `AlertasScheduler` — o unico outro lugar da casa
 * que fala com gente sem ninguem ter pedido. Desligado ele registra em log o
 * que mandaria, e e assim que se confere o barulho antes de deixar sair.
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

describe('TelegramClient', () => {
  /**
   * O RECUO DE TRES ESPACOS NAO APARECIA — visto na tela dele em 10/11.
   *
   * O Telegram praticamente nao mostra espaco a esquerda, entao o que era
   * para ser hierarquia virava tres linhas iguais. A hierarquia agora e feita
   * com o que ele RESPEITA: negrito no titulo, que e o que aparece na previa
   * da notificacao, e italico na linha de contexto.
   */
  it('monta a mensagem com icone, prefixo, titulo em negrito e contexto em italico', async () => {
    let corpo: { chat_id?: string; text?: string; parse_mode?: string } = {};
    const envio: EnvioHttp = async (_u, i) => {
      corpo = JSON.parse(i.body) as typeof corpo;
      return { ok: true, status: 200 };
    };

    await new TelegramClient(cfg(LIGADO), envio).enviar(
      'ruim',
      'Anastasia (gestão) caiu',
      ['Estado: FAILED · 10/11 17:34', 'Precisa reconectar pelo painel.'],
    );

    expect(corpo.chat_id).toBe('42');
    expect(corpo.parse_mode).toBe('HTML');
    expect(corpo.text).toBe(
      '🔴 [A.T JEWEL] <b>Anastasia (gestão) caiu</b>\n' +
        '<i>Estado: FAILED · 10/11 17:34</i>\n' +
        'Precisa reconectar pelo painel.',
    );
  });

  /**
   * O NOME DA VENDEDORA E DADO DE FORA, e com `parse_mode: HTML` um `<` solto
   * quebraria a mensagem inteira — o Telegram recusa com 400 e o aviso some.
   */
  it('escapa o que vem de fora, para um caractere nao derrubar o aviso', async () => {
    let corpo: { text?: string } = {};
    const envio: EnvioHttp = async (_u, i) => {
      corpo = JSON.parse(i.body) as typeof corpo;
      return { ok: true, status: 200 };
    };

    await new TelegramClient(cfg(LIGADO), envio).enviar(
      'neutro',
      'Vendedora: ANA & <b>BIA</b> desconectada',
      ['Estado: STOPPED'],
    );

    expect(corpo.text).toBe(
      '⚪ [A.T JEWEL] <b>Vendedora: ANA &amp; &lt;b&gt;BIA&lt;/b&gt; desconectada</b>\n' +
        '<i>Estado: STOPPED</i>',
    );
  });

  it('titulo sem linha nenhuma continua valendo', async () => {
    let corpo: { text?: string } = {};
    const envio: EnvioHttp = async (_u, i) => {
      corpo = JSON.parse(i.body) as typeof corpo;
      return { ok: true, status: 200 };
    };

    await new TelegramClient(cfg(LIGADO), envio).enviar('bom', 'Tudo certo', []);

    expect(corpo.text).toBe('🟢 [A.T JEWEL] <b>Tudo certo</b>');
  });

  it('o interruptor desligado NAO envia, e devolve true', async () => {
    let chamou = false;
    const envio: EnvioHttp = async () => {
      chamou = true;
      return { ok: true, status: 200 };
    };

    const ok = await new TelegramClient(
      cfg({ ...LIGADO, TELEGRAM_ALERTAS_ATIVOS: 'false' }),
      envio,
    ).enviar('bom', 'x', []);

    expect(chamou).toBe(false);
    expect(ok).toBe(true);
  });

  it('sem token ou sem chat, nao envia', async () => {
    let chamou = false;
    const envio: EnvioHttp = async () => {
      chamou = true;
      return { ok: true, status: 200 };
    };

    await new TelegramClient(
      cfg({ ...LIGADO, TELEGRAM_BOT_TOKEN: '' }),
      envio,
    ).enviar('bom', 'x', []);

    expect(chamou).toBe(false);
  });

  it('tenta de novo quando falha, e devolve false quando nao sai', async () => {
    let tentativas = 0;
    const envio: EnvioHttp = async () => {
      tentativas++;
      return { ok: false, status: 429 };
    };

    const ok = await new TelegramClient(cfg(LIGADO), envio).enviar('ruim', 'x', []);

    expect(tentativas).toBe(3);
    expect(ok).toBe(false);
  });

  it('erro de rede nao estoura para cima', async () => {
    const envio: EnvioHttp = async () => {
      throw new Error('ECONNREFUSED');
    };

    await expect(
      new TelegramClient(cfg(LIGADO), envio).enviar('ruim', 'x', []),
    ).resolves.toBe(false);
  });

  /**
   * O PREFIXO VEM DE FORA TAMBEM — achado da revisao de 10/11.
   *
   * O escape nasceu pensando no nome da vendedora, mas `TELEGRAM_SISTEMA` sai
   * do `.env` e esta em TODA mensagem. Um `A.T JEWEL <prod>` faria o Telegram
   * recusar cada aviso com 400, para sempre, e so o log saberia.
   */
  it('o nome do sistema tambem e escapado', async () => {
    let corpo: { text?: string } = {};
    const envio: EnvioHttp = async (_u, i) => {
      corpo = JSON.parse(i.body) as typeof corpo;
      return { ok: true, status: 200 };
    };

    await new TelegramClient(
      cfg({ ...LIGADO, TELEGRAM_SISTEMA: 'A.T JEWEL <prod>' }),
      envio,
    ).enviar('bom', 'ok', []);

    expect(corpo.text).toBe('🟢 [A.T JEWEL &lt;prod&gt;] <b>ok</b>');
  });

  /**
   * O `fetch` do Node NAO tem prazo total — so um limite de ~300 s por
   * cabecalho/corpo. Com `api.telegram.org` alcancavel mas mudo (proxy
   * travado, DNS preso), tres tentativas levariam ate QUINZE MINUTOS para
   * desistir — e o log de "nao enviado", que e o unico registro de que o
   * aviso existiu, chegaria um quarto de hora depois.
   */
  it('o envio leva prazo, para nao ficar pendurado', async () => {
    let temPrazo = false;
    const envio: EnvioHttp = async (_u, i) => {
      temPrazo = (i as { signal?: unknown }).signal !== undefined;
      return { ok: true, status: 200 };
    };

    await new TelegramClient(cfg(LIGADO), envio).enviar('bom', 'ok', []);

    expect(temPrazo).toBe(true);
  });
});
