import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IWhatsappGateway } from '../../domain/ports/whatsapp-gateway.port';

/**
 * Gateway de WhatsApp via WAHA (WhatsApp HTTP API, self-hosted).
 * Envia mensagens pela send API do WAHA, autenticando por `X-Api-Key`.
 * Config via env: WAHA_BASE_URL, WAHA_API_KEY, WAHA_SESSION.
 */
@Injectable()
export class WahaGateway implements IWhatsappGateway {
  private readonly logger = new Logger(WahaGateway.name);

  constructor(private readonly config: ConfigService) {}

  async enviarTexto(chatId: string, texto: string): Promise<void> {
    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');
    const session = this.config.get<string>('WAHA_SESSION') ?? 'default';

    if (!baseUrl || !apiKey) {
      this.logger.warn('WAHA_BASE_URL/WAHA_API_KEY ausentes — resposta nao enviada.');
      return;
    }

    const url = `${baseUrl.replace(/\/$/, '')}/api/sendText`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ session, chatId, text: texto }),
    });

    if (!resp.ok) {
      const corpo = await resp.text().catch(() => '');
      // Nao logamos o texto da mensagem (pode conter PII); so o status/erro.
      this.logger.error(`WAHA sendText falhou: ${resp.status} ${corpo.slice(0, 200)}`);
      throw new Error(`WAHA sendText retornou ${resp.status}`);
    }
  }
}
