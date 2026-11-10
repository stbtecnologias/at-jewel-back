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
 * A CHAVE VAI NA QUERY STRING, E ISSO FOI MEDIDO, NAO ESCOLHIDO. O primeiro
 * desenho mandava `X-Api-Key` no cabecalho, justamente para a chave nao
 * aparecer em log de acesso. Contra o WAHA de verdade o canal abria e fechava
 * em um segundo, em laco:
 *
 *   so cabecalho       fechou  code=1008 reason=Unauthorized
 *   so query string    SEGUE ABERTO
 *   os dois            SEGUE ABERTO
 *   sem chave nenhuma  fechou  code=1008 reason=Unauthorized
 *
 * O `/ws` nao le cabecalho. Por isso a URL montada aqui NUNCA e escrita em
 * log — e o unico lugar de onde a chave poderia vazar deste arquivo.
 *
 * A dependencia `ws` fica mesmo assim: o `WebSocket` global do Node 22 ainda
 * e experimental, e este canal precisa ficar de pe por semanas.
 *
 * SEM `WAHA_BASE_URL`, O MODULO E INERTE. O homolog foi isolado em 22/09
 * esvaziando a variavel, de proposito. Sem esta guarda ele ficaria em laco de
 * reconexao eterno — e la o `nest start --watch` reinicia a cada arquivo
 * salvo.
 *
 * ==========================================================================
 * AS DUAS LICOES DA REVISAO DE 10/11, E AS DUAS SAO SOBRE FICAR DE PE SOZINHO.
 *
 * ABRIR NAO E ESTAR DE PE. O `code=1008` que eu medi e um close frame: ele so
 * existe DEPOIS do handshake. Logo, `open` e `close` em sequencia. Se `open`
 * zerasse a espera e cancelasse a carencia, um servidor que aceita e derruba
 * daria laco de um segundo para sempre, sem NENHUM aviso saindo — o vigia
 * cego e mudo, que e o defeito original um nivel acima. Por isso "saudavel"
 * significa aberto ha `ESTAVEL_MS`, e nao "abriu".
 *
 * CANO MORTO. `session.status` tem pouquissimo trafego: dias sem um quadro
 * sao normais, entao "nao chega nada" e indistinguivel de "esta tudo bem". Se
 * o conteiner congelar ou a rota cair sem FIN, o socket fica aberto do nosso
 * lado e nenhum `close` dispara. Por isso ping com prazo.
 * ==========================================================================
 */

export interface SocketDoWaha {
  aoAbrir(fn: () => void): void;
  aoReceber(fn: (texto: string) => Promise<void> | void): void;
  aoFechar(fn: () => void): void;
  aoPong(fn: () => void): void;
  /** Sonda de vida. A resposta chega em `aoPong`. */
  pingar(): void;
  /** Corta na marra, para o caminho de queda rodar. */
  derrubar(): void;
  fechar(): void;
}

export type FabricaDeSocket = (url: string) => SocketDoWaha;

/** Espera entre tentativas, parando na ultima. */
const ESPERAS_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];

/** Quanto tempo aberto para a conexao contar como saudavel. */
const ESTAVEL_MS = 30_000;

/** De quanto em quanto se sonda, e quanto se espera pela resposta. */
const PING_MS = 30_000;
const PONG_LIMITE_MS = 60_000;

/**
 * Quanto o canal pode ficar fora antes de isso virar aviso.
 *
 * Reinicio do WAHA (`docker compose up -d`) tem de caber aqui dentro, senao
 * toda manutencao gera o par "perdi a visao" / "voltei" sem nada ter
 * acontecido com os chips.
 */
const CARENCIA_DO_CANAL_MS = 60_000;

const fabricaPadrao: FabricaDeSocket = (url) => {
  const ws = new WebSocket(url);
  return {
    aoAbrir: (f) => ws.on('open', f),
    aoReceber: (f) => ws.on('message', (d: unknown) => void f(String(d))),
    aoFechar: (f) => {
      ws.on('close', f);
      // `error` sem ouvinte derruba o processo no Node. O `close` vem logo
      // atras e e quem agenda a reconexao.
      ws.on('error', () => undefined);
    },
    aoPong: (f) => ws.on('pong', f),
    pingar: () => ws.ping(),
    derrubar: () => ws.terminate(),
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
  private estabilidade: NodeJS.Timeout | null = null;
  private sonda: NodeJS.Timeout | null = null;
  private ultimoPong = 0;
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
    this.pararRelogios();
    if (this.reconexao) clearTimeout(this.reconexao);
    this.reconexao = null;
    this.cancelarCarencia();
    this.socket?.fechar();
    this.socket = null;
  }

  private get url(): string {
    const base = (this.config.get<string>('WAHA_BASE_URL') ?? '').replace(
      /\/$/,
      '',
    );
    const chave = this.config.get<string>('WAHA_API_KEY') ?? '';
    return (
      `${base.replace(/^http/, 'ws')}/ws?events=session.status` +
      `&x-api-key=${encodeURIComponent(chave)}`
    );
  }

  private conectar(): void {
    let socket: SocketDoWaha;
    try {
      socket = this.fabrica(this.url);
    } catch (err) {
      // URL TORTA NAO PODE DERRUBAR A API INTEIRA. O `ws` estoura SINCRONO em
      // URL invalida, e a mensagem do erro traz a URL COMPLETA, com a chave
      // dentro — por isso so o nome do erro vai para o log, nunca a mensagem.
      // E nao se reagenda: URL errada nao fica certa esperando.
      this.encerrado = true;
      this.logger.error(
        `WAHA_BASE_URL invalida (${err instanceof Error ? err.name : 'erro'}): ` +
          'aviso de conexao inerte. Confira o formato, ex.: http://waha:3000',
      );
      return;
    }

    this.socket = socket;

    socket.aoAbrir(() => {
      this.jaConectou = true;
      this.ultimoPong = Date.now();
      this.logger.log('Canal de eventos do WAHA aberto.');

      // SO DEPOIS DE FICAR DE PE e que a conexao conta como saudavel.
      this.estabilidade = this.agendar(() => this.saudavel(), ESTAVEL_MS);
      this.sonda = this.agendar(() => this.sondar(), PING_MS);
    });

    socket.aoPong(() => (this.ultimoPong = Date.now()));
    socket.aoReceber((texto) => this.tratar(texto));
    socket.aoFechar(() => this.aoCair());
  }

  /** Aberto ha tempo suficiente: zera a espera e desarma a carencia. */
  private saudavel(): void {
    this.estabilidade = null;
    this.tentativa = 0;
    this.cancelarCarencia();
    if (this.avisouPerda) {
      this.avisouPerda = false;
      void this.telegram.enviar('bom', 'Contato com o WAHA restabelecido', [
        'Os avisos de conexão voltaram a funcionar.',
      ]);
    }
  }

  /** Sonda de vida: sem resposta no prazo, derruba de proposito. */
  private sondar(): void {
    if (!this.socket) return;
    if (Date.now() - this.ultimoPong > PONG_LIMITE_MS) {
      this.logger.warn(
        'Canal do WAHA sem resposta a sonda: derrubando para reconectar.',
      );
      this.socket.derrubar();
      return;
    }
    this.socket.pingar();
    this.sonda = this.agendar(() => this.sondar(), PING_MS);
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
    this.pararRelogios();

    // Nunca conectou: e configuracao errada ou WAHA fora na subida. Isso e
    // log, e nao aviso repetido no Telegram.
    if (this.jaConectou && !this.avisouPerda && !this.carencia) {
      this.carencia = this.agendar(() => {
        this.carencia = null;
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

  /** Os relogios que so fazem sentido com a conexao de pe. */
  private pararRelogios(): void {
    if (this.estabilidade) clearTimeout(this.estabilidade);
    if (this.sonda) clearTimeout(this.sonda);
    this.estabilidade = null;
    this.sonda = null;
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
