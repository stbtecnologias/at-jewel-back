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
  it('monta a mensagem com icone, prefixo e recuo', async () => {
    let corpo: { chat_id?: string; text?: string } = {};
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
    expect(corpo.text).toBe(
      '🔴 [A.T JEWEL] Anastasia (gestão) caiu\n' +
        '   Estado: FAILED · 10/11 17:34\n' +
        '   Precisa reconectar pelo painel.',
    );
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
});
