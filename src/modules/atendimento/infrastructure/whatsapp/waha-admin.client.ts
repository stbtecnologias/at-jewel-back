import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { montarUrlDeArquivo } from './arquivo-do-waha';

export interface SessaoStatus {
  /** STOPPED | STARTING | SCAN_QR_CODE | WORKING | FAILED | ... */
  status: string;
  /** Dados do numero conectado, quando WORKING. */
  me: { id?: string; pushName?: string } | null;
}

/** Uma sessao como o WAHA a devolve na listagem. */
export interface SessaoListada extends SessaoStatus {
  nome: string;
  /** Ultimo sinal de vida da sessao, em ms. Null quando nunca houve. */
  atividadeEm: number | null;
}

export interface ChatResumo {
  id: string;
  nome: string | null;
  ultimaMensagem: string | null;
  timestamp: number | null;
  picture: string | null;
}

/** Uma mensagem do historico de um chat. */
export interface MensagemChat {
  id: string;
  /** Texto, ou a legenda quando a mensagem tem midia. */
  texto: string | null;
  /** true = enviada pelo numero conectado; false = recebida. */
  minha: boolean;
  /** Segundos desde a epoca, como o WhatsApp entrega. */
  timestamp: number | null;
  temMidia: boolean;
  mimetype: string | null;
  /** 1 enviada, 2 entregue, 3 lida. Null quando o WAHA nao informa. */
  ack: number | null;
}

/**
 * Client das operacoes ADMIN do WAHA (gestao de sessao): listar, status,
 * conectar, QR, chats, mensagens, desconectar. Usado pelos endpoints do painel
 * (JWT), que fazem proxy para nao expor a API key do WAHA ao front.
 *
 * ==========================================================================
 * A SESSAO E ARGUMENTO, E NAO MAIS ENV.
 *
 * Ate 08/09/2026 existia UMA sessao, lida de `WAHA_SESSION`. Agora ha uma por
 * vendedora, alem da loja — entao quem chama diz qual. O `WAHA_SESSION`
 * continua existindo e continua significando A LOJA; ver `ConexoesService`.
 *
 * O nome da sessao NUNCA deve vir cru de uma requisicao: ele entra no caminho
 * da URL do WAHA. Quem valida e o `ConexoesService`, e e por la que os
 * controllers passam.
 * ==========================================================================
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

  /**
   * Todas as sessoes que existem no WAHA, paradas inclusive.
   *
   * O `all=true` NAO E OPCIONAL AQUI: sem ele o WAHA lista so as que estao no
   * ar, e uma vendedora que nunca leu o QR sumiria da tela justamente quando
   * ha algo a fazer com ela.
   */
  async listarSessoes(): Promise<SessaoListada[]> {
    const resp = await this.req('GET', '/api/sessions?all=true');
    if (!resp.ok) throw new Error(`WAHA sessions ${resp.status}`);
    const lista = (await resp.json()) as Array<Record<string, any>>;
    return (Array.isArray(lista) ? lista : []).map((s) => ({
      nome: String(s.name ?? ''),
      status: String(s.status ?? 'UNKNOWN'),
      me: (s.me as SessaoStatus['me']) ?? null,
      atividadeEm:
        typeof s.timestamps?.activity === 'number'
          ? (s.timestamps.activity as number)
          : null,
    }));
  }

  /** Estado da sessao. Retorna status STOPPED quando ela ainda nao existe. */
  async status(sessao: string): Promise<SessaoStatus> {
    const resp = await this.req('GET', `/api/sessions/${enc(sessao)}`);
    if (resp.status === 404) return { status: 'STOPPED', me: null };
    if (!resp.ok) throw new Error(`WAHA status ${resp.status}`);
    const data = (await resp.json()) as {
      status?: string;
      me?: SessaoStatus['me'];
    };
    return { status: data.status ?? 'UNKNOWN', me: data.me ?? null };
  }

  /**
   * Garante a sessao iniciada. Cria se nao existir; se estiver parada, inicia;
   * se estiver em FAILED (ex.: link do aparelho caiu), reinicia para abrir um
   * novo ciclo de autenticacao (STARTING -> SCAN_QR_CODE); se ja estiver
   * ativa/aguardando QR, apenas retorna o estado.
   *
   * ==========================================================================
   * A SESSAO NASCE COM O MESMO WEBHOOK DA LOJA — E ISSO NAO A FAZ RESPONDER.
   *
   * Ela nasceu SEM webhook na primeira versao (08/09 de manha), como trava
   * contra a IA responder no numero da vendedora. No mesmo dia o Lucas pediu o
   * contrario: registrar o contato da cliente, para virar ponto na Linha do
   * Tempo. Sem webhook a mensagem nao chega, entao a trava mudou de lugar —
   * nao de existencia:
   *
   *   1. o `WhatsappWebhookController` desvia tudo que nao vem da sessao da
   *      loja para `registrarSemResponder`, um caminho de onde nao se alcanca
   *      o roteador, a triagem nem o envio;
   *   2. o `WahaGateway` (o que ENVIA) segue preso ao `WAHA_SESSION`, entao
   *      nao existe caminho de codigo capaz de falar pelo numero dela.
   *
   * CAPTURAR NAO E RESPONDER. O que se grava e o FATO — quem falou, quando —
   * e nunca o conteudo: o WAHA ja guarda as mensagens, e a aba Conversas le
   * ao vivo. Ver `RegistrarContatoWhatsappUseCase`.
   *
   * O WEBHOOK E COPIADO DA SESSAO DA LOJA, e nao montado de env novo. Local e
   * producao apontam para hosts diferentes; uma variavel a mais seria uma a
   * mais para esquecer, e a sessao nasceria muda sem ninguem perceber.
   * ==========================================================================
   */
  async conectar(sessao: string): Promise<SessaoStatus> {
    const atual = await this.status(sessao);
    if (atual.status === 'STOPPED') {
      // Tenta iniciar uma sessao ja existente; se nao existe (404), cria.
      const start = await this.req('POST', `/api/sessions/${enc(sessao)}/start`);
      if (start.status === 404) {
        await this.req('POST', '/api/sessions', {
          name: sessao,
          start: true,
          config: await this.configDaLoja(),
        });
      }
    } else if (atual.status === 'FAILED') {
      // Restart e a unica saida do FAILED — start em sessao existente nao
      // reautentica. Depois do restart a sessao pede QR novamente.
      await this.req('POST', `/api/sessions/${enc(sessao)}/restart`);
    }
    return this.status(sessao);
  }

  /**
   * A config de webhook da sessao da LOJA, para a sessao nova nascer igual.
   *
   * Copiar em vez de montar de env tem uma razao pratica: a URL do webhook e
   * o token ja estao certos naquela sessao, nos dois ambientes. Montar de
   * novo aqui criaria uma segunda fonte da verdade — e uma sessao apontando
   * para o lugar errado nao da erro, so fica muda.
   *
   * Se a loja nao tiver webhook (instalacao nova, ou alguem apagou), a sessao
   * nasce sem — e o pior que acontece e o contato nao virar ponto na Linha do
   * Tempo. Nada quebra, e o aviso fica no log.
   */
  private async configDaLoja(): Promise<Record<string, unknown>> {
    const loja = this.config.get<string>('WAHA_SESSION') ?? 'default';
    try {
      const resp = await this.req('GET', `/api/sessions/${enc(loja)}`);
      if (!resp.ok) throw new Error(String(resp.status));
      const dados = (await resp.json()) as {
        config?: { webhooks?: unknown[] };
      };
      const webhooks = dados.config?.webhooks;
      if (!Array.isArray(webhooks) || webhooks.length === 0) {
        this.logger.warn(
          `A sessao "${loja}" nao tem webhook — a nova nascera muda.`,
        );
        return {};
      }
      return { webhooks };
    } catch (err) {
      this.logger.warn(
        `Nao consegui ler a config de "${loja}": ${err instanceof Error ? err.message : err}`,
      );
      return {};
    }
  }

  /** PNG do QR code (data URL base64). So faz sentido em status SCAN_QR_CODE. */
  async qrDataUrl(sessao: string): Promise<string> {
    const resp = await this.req('GET', `/api/${enc(sessao)}/auth/qr`);
    if (!resp.ok) throw new Error(`WAHA qr ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    return `data:image/png;base64,${buf.toString('base64')}`;
  }

  /** Lista os chats (overview: nome, ultima mensagem, foto). */
  async chats(sessao: string): Promise<ChatResumo[]> {
    const resp = await this.req('GET', `/api/${enc(sessao)}/chats/overview`);
    if (!resp.ok) throw new Error(`WAHA chats ${resp.status}`);
    const lista = (await resp.json()) as Array<Record<string, any>>;
    return (Array.isArray(lista) ? lista : []).map((c) => ({
      id: String(c.id ?? ''),
      nome: (c.name as string | null) ?? null,
      ultimaMensagem:
        typeof c.lastMessage?.body === 'string'
          ? (c.lastMessage.body as string)
          : null,
      timestamp:
        typeof c.lastMessage?.timestamp === 'number'
          ? (c.lastMessage.timestamp as number)
          : null,
      picture: (c.picture as string | null) ?? null,
    }));
  }

  /**
   * Quantos chats a sessao tem.
   *
   * `null` quando a consulta falha — a contagem e enfeite da lista de
   * conexoes, e nao vale derrubar a tela inteira por ela.
   */
  async contarChats(sessao: string): Promise<number | null> {
    try {
      return (await this.chats(sessao)).length;
    } catch {
      return null;
    }
  }

  /**
   * O historico de um chat, do mais recente para o mais antigo.
   *
   * `downloadMedia=false` DE PROPOSITO: o WAHA republica a midia decifrada e a
   * apaga em 30 minutos, entao baixar tudo a cada abertura de conversa seria
   * caro e inutil. A mensagem diz que TEM midia e qual o tipo; ver o arquivo e
   * passo proprio, com endpoint proprio.
   */
  async mensagens(
    sessao: string,
    chatId: string,
    limite = 100,
  ): Promise<MensagemChat[]> {
    const resp = await this.req(
      'GET',
      `/api/${enc(sessao)}/chats/${enc(chatId)}/messages` +
        `?limit=${limite}&downloadMedia=false`,
    );
    if (resp.status === 404) return [];
    if (!resp.ok) throw new Error(`WAHA messages ${resp.status}`);
    const lista = (await resp.json()) as Array<Record<string, any>>;
    return (Array.isArray(lista) ? lista : []).map((m) => ({
      id: String(m.id ?? ''),
      texto: typeof m.body === 'string' && m.body !== '' ? m.body : null,
      minha: m.fromMe === true,
      timestamp:
        typeof m.timestamp === 'number' ? (m.timestamp as number) : null,
      temMidia: m.hasMedia === true,
      mimetype:
        typeof m.media?.mimetype === 'string'
          ? (m.media.mimetype as string)
          : null,
      ack: typeof m.ack === 'number' ? (m.ack as number) : null,
    }));
  }

  /**
   * O arquivo de UMA mensagem — a foto, o audio, o video.
   *
   * ==========================================================================
   * POR QUE UMA MENSAGEM DE CADA VEZ, E NAO A CONVERSA INTEIRA.
   *
   * `downloadMedia=true` na listagem faria o WAHA baixar e decifrar TODOS os
   * arquivos das ultimas cem mensagens a cada vez que alguem abre a conversa.
   * Medido em 08/09 na base de producao: uma foto sozinha tem 1,5 MB. Vinte
   * fotos seriam trinta megabytes para ver um "oi".
   *
   * Aqui o download acontece quando o balao aparece na tela, e so para ele.
   * ==========================================================================
   *
   * MIDIA VELHA NAO VOLTA, e nao e defeito nosso: o WhatsApp apaga o arquivo
   * dos servidores dele depois de um tempo. Testando na base de producao, o
   * que tinha 5 dias baixou; o de 102 dias respondeu 403. Nesse caso o WAHA
   * devolve `media.error` e nenhuma URL, e isto aqui retorna `null`.
   */
  async midiaDaMensagem(
    sessao: string,
    chatId: string,
    mensagemId: string,
  ): Promise<{ conteudo: Buffer; mime: string } | null> {
    const resp = await this.req(
      'GET',
      `/api/${enc(sessao)}/chats/${enc(chatId)}/messages/${enc(mensagemId)}` +
        '?downloadMedia=true',
    );
    if (!resp.ok) return null;

    const msg = (await resp.json()) as {
      media?: { url?: string | null; mimetype?: string | null } | null;
    };
    const url = msg.media?.url;
    if (!url) return null;

    // O WAHA responde com o hostname da rede Docker DELE (`waha:3000`), que
    // daqui nao resolve. `montarUrlDeArquivo` reaproveita so o caminho — e
    // recusa o que nao for `/api/files/`.
    const alvo = montarUrlDeArquivo(this.base, url);
    if (!alvo) {
      this.logger.warn('URL de midia com caminho inesperado — recusada.');
      return null;
    }

    const arquivo = await fetch(alvo, {
      headers: { 'X-Api-Key': this.apiKey },
      signal: AbortSignal.timeout(60_000),
    });
    if (!arquivo.ok) return null;

    return {
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
      mime:
        msg.media?.mimetype ??
        arquivo.headers.get('content-type') ??
        'application/octet-stream',
    };
  }

  /** Desconecta o numero (logout) — gera novo QR no proximo conectar. */
  async desconectar(sessao: string): Promise<void> {
    const resp = await this.req('POST', `/api/sessions/${enc(sessao)}/logout`);
    if (!resp.ok && resp.status !== 404) {
      this.logger.warn(`WAHA logout retornou ${resp.status}`);
    }
  }
}

/**
 * Cinto de seguranca do caminho da URL.
 *
 * A validacao de verdade — se este nome corresponde a alguem — e do
 * `ConexoesService`. Aqui so nao se deixa uma barra virar outro endpoint do
 * WAHA, com a nossa `X-Api-Key` no cabecalho.
 */
function enc(valor: string): string {
  return encodeURIComponent(valor);
}
