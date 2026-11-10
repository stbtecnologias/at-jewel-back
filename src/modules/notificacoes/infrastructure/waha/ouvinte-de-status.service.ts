import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { AvisarMudancaDeConexaoUseCase } from '../../application/avisar-mudanca-de-conexao.use-case';
import { TelegramClient } from '../telegram/telegram.client';

/**
 * ==========================================================================
 * O CANAL DE EVENTOS DO WAHA — 10/11/2026.
 *
 * MEDIDO antes de escolher: uma sessao criada com `webhooks: []` — nenhum
 * webhook configurado — teve os eventos `session.status` entregues por este
 * canal, no WAHA 2026.8.2, engine GOWS, tier CORE. O payload traz o proprio
 * `"tier":"CORE"` dentro dele.
 *
 * POR QUE NAO O WEBHOOK POR SESSAO. O `garantirEventos` pula os numeros da
 * casa (`if (ehDaCasa) return`) — Anastasia e Helena, justamente as que mais
 * importam — e so roda quando alguem clica em Conectar. E reescrever a config
 * de uma sessao a REINICIA: em chip sem aparelho, isso pode significar QR
 * novo, que e o pior cenario possivel. Aqui nenhuma sessao e tocada.
 *
 * A CHAVE VAI NO CABECALHO. O `WebSocket` embutido do Node 22 nao aceita
 * cabecalho, e a chave teria de viajar na query string, onde aparece em log
 * de acesso e em historico. E o unico motivo de existir a dependencia `ws`.
 *
 * SEM `WAHA_BASE_URL`, O MODULO E INERTE. O homolog foi isolado em 22/09
 * esvaziando a variavel, de proposito. Sem esta guarda ele ficaria em laco de
 * reconexao eterno — e la o `nest start --watch` reinicia a cada arquivo
 * salvo.
 * ==========================================================================
 */

export interface SocketDoWaha {
  aoAbrir(fn: () => void): void;
  aoReceber(fn: (texto: string) => Promise<void> | void): void;
  aoFechar(fn: () => void): void;
  fechar(): void;
}

export type FabricaDeSocket = (
  url: string,
  cabecalhos: Record<string, string>,
) => SocketDoWaha;

/** Espera entre tentativas, parando na ultima. */
const ESPERAS_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];

/**
 * Quanto o canal pode ficar fora antes de isso virar aviso.
 *
 * Reinicio do WAHA (`docker compose up -d`) tem de caber aqui dentro, senao
 * toda manutencao gera o par "perdi a visao" / "voltei" sem nada ter
 * acontecido com os chips.
 */
const CARENCIA_DO_CANAL_MS = 60_000;

const fabricaPadrao: FabricaDeSocket = (url, cabecalhos) => {
  const ws = new WebSocket(url, { headers: cabecalhos });
  return {
    aoAbrir: (f) => ws.on('open', f),
    aoReceber: (f) => ws.on('message', (d: unknown) => void f(String(d))),
    aoFechar: (f) => {
      ws.on('close', f);
      // `error` sem ouvinte derruba o processo no Node. O `close` vem logo
      // atras e e quem agenda a reconexao.
      ws.on('error', () => undefined);
    },
    fechar: () => ws.close(),
  };
};

interface CorpoDoEvento {
  event?: string;
  session?: string;
  me?: { id?: string } | null;
  payload?: { status?: string };
}

@Injectable()
export class OuvinteDeStatusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OuvinteDeStatusService.name);
  private socket: SocketDoWaha | null = null;
  private tentativa = 0;
  private reconexao: NodeJS.Timeout | null = null;
  private carencia: NodeJS.Timeout | null = null;
  private avisouPerda = false;
  private jaConectou = false;
  private encerrado = false;

  constructor(
    private readonly config: ConfigService,
    private readonly avisar: AvisarMudancaDeConexaoUseCase,
    private readonly telegram: TelegramClient,
    private readonly fabrica: FabricaDeSocket = fabricaPadrao,
  ) {}

  onModuleInit(): void {
    const base = this.config.get<string>('WAHA_BASE_URL') ?? '';
    if (!base) {
      this.logger.log(
        'Sem WAHA_BASE_URL: aviso de conexao inerte. Nada sera observado.',
      );
      return;
    }
    this.conectar();
  }

  onModuleDestroy(): void {
    this.encerrado = true;
    if (this.reconexao) clearTimeout(this.reconexao);
    if (this.carencia) clearTimeout(this.carencia);
    this.reconexao = null;
    this.carencia = null;
    this.socket?.fechar();
    this.socket = null;
  }

  private get url(): string {
    const base = (this.config.get<string>('WAHA_BASE_URL') ?? '').replace(
      /\/$/,
      '',
    );
    return `${base.replace(/^http/, 'ws')}/ws?events=session.status`;
  }

  private conectar(): void {
    const chave = this.config.get<string>('WAHA_API_KEY') ?? '';
    const socket = this.fabrica(this.url, { 'X-Api-Key': chave });
    this.socket = socket;

    socket.aoAbrir(() => {
      this.tentativa = 0;
      this.cancelarCarencia();
      if (this.avisouPerda) {
        this.avisouPerda = false;
        void this.telegram.enviar('bom', 'Contato com o WAHA restabelecido', [
          'Os avisos de conexão voltaram a funcionar.',
        ]);
      }
      this.jaConectou = true;
      this.logger.log('Canal de eventos do WAHA aberto.');
    });

    socket.aoReceber((texto) => this.tratar(texto));
    socket.aoFechar(() => this.aoCair());
  }

  /**
   * NUNCA ESTOURA. Evento malformado, sem status ou de outro tipo e
   * descartado em silencio — o ouvinte precisa continuar vivo depois dele.
   */
  private async tratar(texto: string): Promise<void> {
    let corpo: CorpoDoEvento;
    try {
      corpo = JSON.parse(texto) as CorpoDoEvento;
    } catch {
      this.logger.debug('Evento do WAHA que nao e JSON: ignorado.');
      return;
    }

    if (corpo.event !== 'session.status') return;
    const status = corpo.payload?.status;
    const sessao = corpo.session;
    if (!status || !sessao) {
      this.logger.debug('Evento session.status sem sessao ou sem status.');
      return;
    }

    try {
      await this.avisar.executar({
        sessao,
        status,
        numero: corpo.me?.id ?? null,
        em: new Date(),
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao avisar "${sessao}" em ${status}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private aoCair(): void {
    if (this.encerrado) return;
    this.socket = null;

    // Nunca conectou: e configuracao errada ou WAHA fora na subida. Isso e
    // log, e nao aviso repetido no Telegram.
    if (this.jaConectou && !this.avisouPerda && !this.carencia) {
      this.carencia = this.agendar(() => {
        this.avisouPerda = true;
        void this.telegram.enviar('ruim', 'Sem contato com o WAHA', [
          'Mudanças de conexão não estão sendo observadas.',
        ]);
      }, CARENCIA_DO_CANAL_MS);
    }

    const espera = ESPERAS_MS[Math.min(this.tentativa, ESPERAS_MS.length - 1)];
    this.tentativa++;
    this.logger.warn(`Canal do WAHA caiu. Nova tentativa em ${espera} ms.`);
    this.reconexao = this.agendar(() => this.conectar(), espera);
  }

  private cancelarCarencia(): void {
    if (this.carencia) clearTimeout(this.carencia);
    this.carencia = null;
  }

  /** `unref` para o relogio nao segurar o processo nem o jest. */
  private agendar(fn: () => void, ms: number): NodeJS.Timeout {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  }
}
