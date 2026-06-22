import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SessaoStatus {
  /** STOPPED | STARTING | SCAN_QR_CODE | WORKING | FAILED | ... */
  status: string;
  /** Dados do numero conectado, quando WORKING. */
  me: { id?: string; pushName?: string } | null;
}

export interface ChatResumo {
  id: string;
  nome: string | null;
  ultimaMensagem: string | null;
  timestamp: number | null;
  picture: string | null;
}

/**
 * Client das operacoes ADMIN do WAHA (gestao de sessao): status, conectar,
 * QR, listar chats, desconectar. Usado pelos endpoints do painel (JWT/ADMIN),
 * que fazem proxy para nao expor a API key do WAHA ao front.
 */
@Injectable()
export class WahaAdminClient {
  private readonly logger = new Logger(WahaAdminClient.name);

  constructor(private readonly config: ConfigService) {}

  private get base(): string {
    return (this.config.get<string>('WAHA_BASE_URL') ?? '').replace(/\/$/, '');
  }
  private get apiKey(): string {
    return this.config.get<string>('WAHA_API_KEY') ?? '';
  }
  private get session(): string {
    return this.config.get<string>('WAHA_SESSION') ?? 'default';
  }

  private async req(
    metodo: string,
    caminho: string,
    body?: unknown,
  ): Promise<Response> {
    return fetch(`${this.base}${caminho}`, {
      method: metodo,
      headers: {
        'X-Api-Key': this.apiKey,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  /** Estado da sessao. Retorna status STOPPED quando ela ainda nao existe. */
  async status(): Promise<SessaoStatus> {
    const resp = await this.req('GET', `/api/sessions/${this.session}`);
    if (resp.status === 404) return { status: 'STOPPED', me: null };
    if (!resp.ok) throw new Error(`WAHA status ${resp.status}`);
    const data = (await resp.json()) as { status?: string; me?: SessaoStatus['me'] };
    return { status: data.status ?? 'UNKNOWN', me: data.me ?? null };
  }

  /**
   * Garante a sessao iniciada. Cria se nao existir; se estiver parada, inicia;
   * se ja estiver ativa/aguardando QR, apenas retorna o estado.
   */
  async conectar(): Promise<SessaoStatus> {
    const atual = await this.status();
    if (atual.status === 'STOPPED') {
      // Tenta iniciar uma sessao ja existente; se nao existe (404), cria.
      const start = await this.req('POST', `/api/sessions/${this.session}/start`);
      if (start.status === 404) {
        await this.req('POST', '/api/sessions', { name: this.session, start: true });
      }
    }
    return this.status();
  }

  /** PNG do QR code (data URL base64). So faz sentido em status SCAN_QR_CODE. */
  async qrDataUrl(): Promise<string> {
    const resp = await this.req('GET', `/api/${this.session}/auth/qr`);
    if (!resp.ok) throw new Error(`WAHA qr ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    return `data:image/png;base64,${buf.toString('base64')}`;
  }

  /** Lista os chats (overview: nome, ultima mensagem, foto). */
  async chats(): Promise<ChatResumo[]> {
    const resp = await this.req('GET', `/api/${this.session}/chats/overview`);
    if (!resp.ok) throw new Error(`WAHA chats ${resp.status}`);
    const lista = (await resp.json()) as Array<Record<string, any>>;
    return (Array.isArray(lista) ? lista : []).map((c) => ({
      id: String(c.id ?? ''),
      nome: c.name ?? null,
      ultimaMensagem:
        typeof c.lastMessage?.body === 'string' ? c.lastMessage.body : null,
      timestamp:
        typeof c.lastMessage?.timestamp === 'number' ? c.lastMessage.timestamp : null,
      picture: c.picture ?? null,
    }));
  }

  /** Desconecta o numero (logout) — gera novo QR no proximo conectar. */
  async desconectar(): Promise<void> {
    const resp = await this.req('POST', `/api/sessions/${this.session}/logout`);
    if (!resp.ok && resp.status !== 404) {
      this.logger.warn(`WAHA logout retornou ${resp.status}`);
    }
  }
}
