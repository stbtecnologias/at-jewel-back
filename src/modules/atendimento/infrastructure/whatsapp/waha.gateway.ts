import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IWhatsappGateway } from '../../domain/ports/whatsapp-gateway.port';
import { montarUrlDeArquivo } from './arquivo-do-waha';

/**
 * Gateway de WhatsApp via WAHA (WhatsApp HTTP API, self-hosted).
 * Envia mensagens pela send API do WAHA, autenticando por `X-Api-Key`.
 * Config via env: WAHA_BASE_URL, WAHA_API_KEY, WAHA_SESSION.
 *
 * ==========================================================================
 * ESTE ARQUIVO CONTINUA PRESO A UMA SESSAO SO, E ISSO E UMA GARANTIA.
 *
 * Em 08/09/2026 as sessoes viraram varias — uma por vendedora, alem da loja —
 * e o `WahaAdminClient` passou a receber qual delas como argumento. Aqui NAO.
 *
 * A diferenca e que este e o objeto que FALA. Enquanto ele so souber enviar
 * pelo `WAHA_SESSION`, nao existe caminho de codigo — nem por engano, nem por
 * uma tool de agente mal escrita amanha — capaz de mandar mensagem pelo numero
 * de uma vendedora. A limitacao E o mecanismo de seguranca.
 *
 * E a terceira das tres camadas descritas em `WahaAdminClient.conectar`. Se um
 * dia for preciso enviar por outra sessao, isso e uma decisao de produto sobre
 * a IA falar no lugar de uma pessoa — nao um parametro a mais.
 * ==========================================================================
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
      this.logger.warn(
        'WAHA_BASE_URL/WAHA_API_KEY ausentes — chatId nao resolvido.',
      );
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
      this.logger.warn(
        'WAHA_BASE_URL/WAHA_API_KEY ausentes — LID nao resolvido.',
      );
      return de;
    }

    const url =
      `${baseUrl.replace(/\/$/, '')}/api/${encodeURIComponent(session)}` +
      `/lids/${encodeURIComponent(de)}`;

    try {
      const resp = await fetch(url, { headers: { 'X-Api-Key': apiKey } });
      if (!resp.ok) {
        this.logger.warn(
          `WAHA lids retornou ${resp.status} — LID nao resolvido.`,
        );
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
      this.logger.warn(
        'WAHA_BASE_URL/WAHA_API_KEY ausentes — resposta nao enviada.',
      );
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
      this.logger.error(
        `WAHA sendText falhou: ${resp.status} ${corpo.slice(0, 200)}`,
      );
      throw new Error(`WAHA sendText retornou ${resp.status}`);
    }
  }

  async enviarImagem(
    chatId: string,
    conteudo: Buffer,
    mime: string,
    legenda: string,
  ): Promise<void> {
    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');
    const session = this.config.get<string>('WAHA_SESSION') ?? 'default';

    if (!baseUrl || !apiKey) {
      this.logger.warn(
        'WAHA_BASE_URL/WAHA_API_KEY ausentes — imagem nao enviada.',
      );
      return;
    }

    const url = `${baseUrl.replace(/\/$/, '')}/api/sendImage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({
        session,
        chatId,
        file: {
          mimetype: mime,
          // BASE64, e nao URL: a imagem esta num bucket privado, e o WhatsApp
          // nao teria como baixa-la de la.
          data: conteudo.toString('base64'),
          filename: 'peca.png',
        },
        caption: legenda,
      }),
    });

    if (!resp.ok) {
      const corpo = await resp.text().catch(() => '');
      this.logger.error(
        `WAHA sendImage falhou: ${resp.status} ${corpo.slice(0, 200)}`,
      );
      throw new Error(`WAHA sendImage retornou ${resp.status}`);
    }
  }

  async baixarMidia(
    url: string,
  ): Promise<{ conteudo: Buffer; mimetype: string } | null> {
    const baseUrl = this.config.get<string>('WAHA_BASE_URL');
    const apiKey = this.config.get<string>('WAHA_API_KEY');

    if (!baseUrl || !apiKey) {
      this.logger.warn(
        'WAHA_BASE_URL/WAHA_API_KEY ausentes — midia nao baixada.',
      );
      return null;
    }

    const alvo = montarUrlDeArquivo(baseUrl, url);
    if (!alvo) {
      // Ver `montarUrlDeArquivo`: caminho fora de /api/files nao e nosso.
      this.logger.warn(
        'URL de midia com caminho inesperado — download recusado.',
      );
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

