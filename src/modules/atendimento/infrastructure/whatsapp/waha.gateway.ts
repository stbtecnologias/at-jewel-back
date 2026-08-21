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

  async resolverChatId(telefone: string): Promise<string | null> {
    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');
    const session = this.config.get<string>('WAHA_SESSION') ?? 'default';

    if (!baseUrl || !apiKey) {
      this.logger.warn('WAHA_BASE_URL/WAHA_API_KEY ausentes — chatId nao resolvido.');
      return null;
    }

    const digitos = telefone.replace(/\D/g, '');
    if (digitos.length === 0) return null;

    const url =
      `${baseUrl.replace(/\/$/, '')}/api/contacts/check-exists` +
      `?phone=${encodeURIComponent(digitos)}&session=${encodeURIComponent(session)}`;

    const resp = await fetch(url, { headers: { 'X-Api-Key': apiKey } });
    if (!resp.ok) {
      this.logger.error(`WAHA check-exists falhou: ${resp.status}`);
      throw new Error(`WAHA check-exists retornou ${resp.status}`);
    }

    const dados = (await resp.json()) as {
      numberExists?: boolean;
      chatId?: string;
    };
    if (!dados.numberExists || !dados.chatId) return null;
    return dados.chatId;
  }

  async resolverRemetente(de: string): Promise<string> {
    if (!de.endsWith('@lid')) return de;

    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');
    const session = this.config.get<string>('WAHA_SESSION') ?? 'default';

    if (!baseUrl || !apiKey) {
      this.logger.warn('WAHA_BASE_URL/WAHA_API_KEY ausentes — LID nao resolvido.');
      return de;
    }

    const url =
      `${baseUrl.replace(/\/$/, '')}/api/${encodeURIComponent(session)}` +
      `/lids/${encodeURIComponent(de)}`;

    try {
      const resp = await fetch(url, { headers: { 'X-Api-Key': apiKey } });
      if (!resp.ok) {
        this.logger.warn(`WAHA lids retornou ${resp.status} — LID nao resolvido.`);
        return de;
      }
      const dados = (await resp.json()) as { pn?: string };
      return dados.pn ?? de;
    } catch (err) {
      // Nunca derruba o webhook: sem traducao o remetente so nao e
      // reconhecido, e o canal e default-deny de qualquer forma.
      this.logger.warn(
        `Falha ao resolver LID: ${err instanceof Error ? err.message : err}`,
      );
      return de;
    }
  }

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

  async baixarMidia(
    url: string,
  ): Promise<{ conteudo: Buffer; mimetype: string } | null> {
    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');

    if (!baseUrl || !apiKey) {
      this.logger.warn('WAHA_BASE_URL/WAHA_API_KEY ausentes — midia nao baixada.');
      return null;
    }

    const alvo = montarUrlDeArquivo(baseUrl, url);
    if (!alvo) {
      // Ver `montarUrlDeArquivo`: caminho fora de /api/files nao e nosso.
      this.logger.warn('URL de midia com caminho inesperado — download recusado.');
      return null;
    }

    try {
      const resp = await fetch(alvo, {
        headers: { 'X-Api-Key': apiKey },
        signal: AbortSignal.timeout(60_000),
      });
      if (!resp.ok) {
        this.logger.error(`WAHA download de midia falhou: ${resp.status}`);
        return null;
      }
      const conteudo = Buffer.from(await resp.arrayBuffer());
      const mimetype =
        resp.headers.get('content-type') ?? 'application/octet-stream';
      return { conteudo, mimetype };
    } catch (err) {
      // Igual ao resolverRemetente: nunca derruba o webhook. Sem o audio, a
      // mensagem so nao e entendida.
      this.logger.error(
        `Falha ao baixar midia do WAHA: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }
}

/**
 * Recompoe a URL do arquivo sobre o host que NOS alcancamos.
 *
 * O WAHA devolve `http://waha:3000/api/files/...` — hostname da rede Docker
 * dele, que daqui nao resolve. Ficamos so com o caminho.
 *
 * E o caminho e conferido de proposito. O `url` chega de um payload externo;
 * mesmo com o webhook protegido por token, aceitar qualquer caminho faria este
 * metodo buscar o que mandassem, com a nossa `X-Api-Key` no cabecalho. Aceitar
 * so `/api/files/` custa uma linha e fecha isso.
 *
 * @returns a URL a usar, ou `null` se o caminho nao for de arquivo do WAHA.
 */
function montarUrlDeArquivo(baseUrl: string, url: string): string | null {
  let caminho: string;
  try {
    const u = new URL(url);
    caminho = u.pathname + u.search;
  } catch {
    // Veio caminho relativo em vez de URL completa — tambem serve.
    caminho = url.startsWith('/') ? url : `/${url}`;
  }

  if (!caminho.startsWith('/api/files/')) return null;
  return `${baseUrl.replace(/\/$/, '')}${caminho}`;
}
