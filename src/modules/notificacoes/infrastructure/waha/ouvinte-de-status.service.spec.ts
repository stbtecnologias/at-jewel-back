import type { ConfigService } from '@nestjs/config';
import {
  OuvinteDeStatusService,
  type FabricaDeSocket,
  type SocketDoWaha,
} from './ouvinte-de-status.service';

/**
 * ==========================================================================
 * O CANAL QUE NAO TOCA EM NENHUMA SESSAO — 10/11/2026.
 *
 * MEDIDO antes de escolher: uma sessao criada com `webhooks: []` — nenhum
 * webhook configurado — ainda assim teve os eventos `session.status`
 * entregues pelo canal `/ws`, no WAHA 2026.8.2, GOWS, tier CORE. E por isso
 * que este caminho foi escolhido: nenhuma sessao e reescrita, e reescrever a
 * config de uma sessao a REINICIA — em chip sem aparelho, QR novo.
 * ==========================================================================
 */

const cfg = (base: string): ConfigService =>
  ({
    get: (k: string) => (k === 'WAHA_BASE_URL' ? base : 'chave'),
  }) as unknown as ConfigService;

interface Pontas {
  abrir?: () => void;
  receber?: (t: string) => Promise<void> | void;
  fechar?: () => void;
  pong?: () => void;
}

interface Espiao {
  s: SocketDoWaha;
  h: Pontas;
  pings: number;
  derrubado: boolean;
}

function sockete(): Espiao {
  const h: Pontas = {};
  const e: Espiao = {
    h,
    pings: 0,
    derrubado: false,
    s: {
      aoAbrir: (f) => (h.abrir = f),
      aoReceber: (f) => (h.receber = f),
      aoFechar: (f) => (h.fechar = f),
      aoPong: (f) => (h.pong = f),
      pingar: () => e.pings++,
      derrubar: () => (e.derrubado = true),
      fechar: () => undefined,
    },
  };
  return e;
}

const EVENTO = JSON.stringify({
  event: 'session.status',
  session: 'default',
  me: null,
  payload: { status: 'FAILED' },
});

const nadaFaz = { executar: async () => undefined } as never;
const semTelegram = { enviar: async () => true } as never;

describe('OuvinteDeStatusService', () => {
  it('sem WAHA_BASE_URL o ouvinte NAO conecta', () => {
    let criou = false;
    const fabrica: FabricaDeSocket = () => {
      criou = true;
      return sockete().s;
    };

    new OuvinteDeStatusService(
      cfg(''),
      nadaFaz,
      semTelegram,
      fabrica,
    ).onModuleInit();

    expect(criou).toBe(false);
  });

  /**
   * A CHAVE VAI NA QUERY STRING, e isso foi MEDIDO, nao escolhido.
   *
   * O primeiro desenho mandava `X-Api-Key` no cabecalho, para a chave nao
   * aparecer em log de acesso. Contra o WAHA de verdade (2026.8.2, GOWS,
   * CORE) o canal abria e fechava em um segundo, em laco:
   *
   *   so cabecalho       fechou  code=1008 reason=Unauthorized
   *   so query string    SEGUE ABERTO
   *   os dois            SEGUE ABERTO
   *   sem chave nenhuma  fechou  code=1008 reason=Unauthorized
   *
   * O `/ws` nao le cabecalho. Entao a chave vai na URL — e, por isso, a URL
   * NUNCA e escrita em log: e o unico lugar onde ela poderia vazar daqui.
   */
  it('a chave vai na query string, que e o que o /ws aceita', () => {
    let url = '';
    const fabrica: FabricaDeSocket = (u) => {
      url = u;
      return sockete().s;
    };

    const o = new OuvinteDeStatusService(
      cfg('http://waha:3000'),
      nadaFaz,
      semTelegram,
      fabrica,
    );
    o.onModuleInit();

    expect(url).toBe('ws://waha:3000/ws?events=session.status&x-api-key=chave');
    o.onModuleDestroy();
  });

  /**
   * URL TORTA NAO PODE DERRUBAR A API INTEIRA.
   *
   * `new WebSocket('waha:3000')` estoura SINCRONO, e a mensagem do erro traz
   * a URL COMPLETA — com a chave dentro. Dentro do `onModuleInit` isso nao e
   * "o aviso nao funciona": e o Nest nao subir, com a chave no stack trace.
   * E `WAHA_BASE_URL` nao esta no `.env.example`, o que torna o erro de
   * digitacao bem mais provavel do que parece.
   */
  it('URL invalida nao derruba o boot, e nao fica tentando', () => {
    const fabrica: FabricaDeSocket = () => {
      throw new SyntaxError('Invalid URL: ws:// errado?x-api-key=SEGREDO');
    };

    const o = new OuvinteDeStatusService(
      cfg('http:// errado'),
      nadaFaz,
      semTelegram,
      fabrica,
    );

    expect(() => o.onModuleInit()).not.toThrow();
    o.onModuleDestroy();
  });

  it('evento valido chega no caso de uso', async () => {
    const vistos: Array<{ sessao: string; status: string }> = [];
    const e = sockete();

    const o = new OuvinteDeStatusService(
      cfg('http://waha:3000'),
      {
        executar: async (ev: { sessao: string; status: string }) => {
          vistos.push(ev);
        },
      } as never,
      semTelegram,
      () => e.s,
    );
    o.onModuleInit();
    await e.h.receber?.(EVENTO);

    expect(vistos[0].sessao).toBe('default');
    expect(vistos[0].status).toBe('FAILED');
    o.onModuleDestroy();
  });

  it('JSON quebrado e evento sem status nao estouram', async () => {
    const e = sockete();
    const quebra = {
      executar: async () => {
        throw new Error('nunca deveria ser chamado');
      },
    } as never;

    const o = new OuvinteDeStatusService(
      cfg('http://waha:3000'),
      quebra,
      semTelegram,
      () => e.s,
    );
    o.onModuleInit();

    await expect(e.h.receber?.('{ isso nao e json')).resolves.toBeUndefined();
    await expect(
      e.h.receber?.(
        JSON.stringify({ event: 'session.status', session: 'x', payload: {} }),
      ),
    ).resolves.toBeUndefined();
    o.onModuleDestroy();
  });

  it('evento que nao e session.status e ignorado', async () => {
    const vistos: unknown[] = [];
    const e = sockete();

    const o = new OuvinteDeStatusService(
      cfg('http://waha:3000'),
      { executar: async (ev: unknown) => void vistos.push(ev) } as never,
      semTelegram,
      () => e.s,
    );
    o.onModuleInit();
    await e.h.receber?.(
      JSON.stringify({ event: 'message', session: 'default', payload: {} }),
    );

    expect(vistos).toHaveLength(0);
    o.onModuleDestroy();
  });

  it('falha do caso de uso nao derruba o ouvinte', async () => {
    const e = sockete();
    const quebra = {
      executar: async () => {
        throw new Error('telegram fora');
      },
    } as never;

    const o = new OuvinteDeStatusService(
      cfg('http://waha:3000'),
      quebra,
      semTelegram,
      () => e.s,
    );
    o.onModuleInit();

    await expect(e.h.receber?.(EVENTO)).resolves.toBeUndefined();
    o.onModuleDestroy();
  });

  it('o numero so viaja quando o WAHA manda `me`', async () => {
    const vistos: Array<{ numero: string | null }> = [];
    const e = sockete();

    const o = new OuvinteDeStatusService(
      cfg('http://waha:3000'),
      {
        executar: async (ev: { numero: string | null }) => void vistos.push(ev),
      } as never,
      semTelegram,
      () => e.s,
    );
    o.onModuleInit();
    await e.h.receber?.(
      JSON.stringify({
        event: 'session.status',
        session: 'default',
        me: { id: '5585920110403@c.us' },
        payload: { status: 'WORKING' },
      }),
    );

    expect(vistos[0].numero).toBe('5585920110403@c.us');
    o.onModuleDestroy();
  });

  /**
   * ==========================================================================
   * ABRIR NAO E ESTAR DE PE — achado da revisao de 10/11.
   *
   * O `code=1008 Unauthorized` que eu medi e um CLOSE FRAME: ele so existe
   * depois do handshake ter dado certo. Ou seja, o `ws` emite `open` e logo
   * em seguida `close`. Se `open` zera a espera e cancela a carencia, um
   * servidor que aceita e derruba produz:
   *
   *   - laco de um segundo, para sempre, martelando o WAHA;
   *   - a carencia NUNCA amadurece, entao o aviso "Sem contato com o WAHA"
   *     nunca sai;
   *   - duas linhas de log por segundo, ~170 mil por dia.
   *
   * O vigia fica cego E mudo — que e o defeito de tres dias de silencio
   * reproduzido um nivel acima. Por isso "saudavel" passou a significar
   * ABERTO HA UM TEMPO, e nao "abriu".
   * ==========================================================================
   */
  describe('abrir e cair na hora', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const montar = (enviados: Array<{ nivel: string; titulo: string }>) => {
      const sockets: Espiao[] = [];
      const fabrica: FabricaDeSocket = () => {
        const e = sockete();
        sockets.push(e);
        return e.s;
      };
      const telegram = {
        enviar: async (nivel: string, aviso: { titulo: string }) => {
          enviados.push({ nivel, titulo: aviso.titulo });
          return true;
        },
      } as never;
      const o = new OuvinteDeStatusService(
        cfg('http://waha:3000'),
        nadaFaz,
        telegram,
        fabrica,
      );
      return { o, sockets };
    };

    it('NAO zera a espera: a segunda queda espera mais que a primeira', () => {
      const { o, sockets } = montar([]);
      o.onModuleInit();

      // Abre e cai na hora, duas vezes.
      sockets[0].h.abrir?.();
      sockets[0].h.fechar?.();
      jest.advanceTimersByTime(1_000);
      expect(sockets).toHaveLength(2);

      sockets[1].h.abrir?.();
      sockets[1].h.fechar?.();
      jest.advanceTimersByTime(1_000);
      expect(sockets).toHaveLength(2); // ainda nao: a espera agora e maior

      jest.advanceTimersByTime(1_000);
      expect(sockets).toHaveLength(3);

      o.onModuleDestroy();
    });

    it('a carencia amadurece e o aviso de perda SAI, mesmo abrindo no meio', async () => {
      const enviados: Array<{ nivel: string; titulo: string }> = [];
      const { o, sockets } = montar(enviados);
      o.onModuleInit();

      sockets[0].h.abrir?.();
      sockets[0].h.fechar?.();

      // Reconecta e cai de novo, varias vezes, dentro da carencia.
      for (let i = 0; i < 20; i++) {
        jest.advanceTimersByTime(5_000);
        const ultimo = sockets[sockets.length - 1];
        ultimo.h.abrir?.();
        ultimo.h.fechar?.();
      }

      expect(enviados.map((e) => e.titulo)).toContain('Sem contato com o WAHA');
      o.onModuleDestroy();
    });

    it('conexao que FICA de pe zera a espera', () => {
      const { o, sockets } = montar([]);
      o.onModuleInit();

      sockets[0].h.abrir?.();
      sockets[0].h.fechar?.();
      jest.advanceTimersByTime(1_000);

      // A segunda fica de pe tempo suficiente para ser considerada saudavel.
      sockets[1].h.abrir?.();
      jest.advanceTimersByTime(31_000);
      sockets[1].h.fechar?.();

      jest.advanceTimersByTime(1_000);
      expect(sockets).toHaveLength(3); // voltou para a primeira espera

      o.onModuleDestroy();
    });
  });

  /**
   * ==========================================================================
   * O CANO MORTO — achado da revisao de 10/11.
   *
   * `session.status` e fluxo de pouquissimo trafego: dias sem um unico quadro
   * sao normais. Entao "nao chega nada" e indistinguivel de "esta tudo bem".
   * Se o conteiner do WAHA congelar, ou a rota cair sem FIN, o socket fica
   * ABERTO do nosso lado e nenhum `close` dispara — o ouvinte escuta um cano
   * morto por semanas, dizendo que esta de pe.
   *
   * Por isso ping com prazo: sem pong dentro do prazo, derruba de proposito,
   * e o caminho de queda que ja existe faz o resto.
   * ==========================================================================
   */
  describe('cano morto', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('manda ping enquanto esta de pe', () => {
      const e = sockete();
      const o = new OuvinteDeStatusService(
        cfg('http://waha:3000'),
        nadaFaz,
        semTelegram,
        () => e.s,
      );
      o.onModuleInit();
      e.h.abrir?.();

      jest.advanceTimersByTime(30_000);
      expect(e.pings).toBe(1);

      e.h.pong?.();
      jest.advanceTimersByTime(30_000);
      expect(e.pings).toBe(2);

      o.onModuleDestroy();
    });

    it('sem pong dentro do prazo, derruba a conexao', () => {
      const e = sockete();
      const o = new OuvinteDeStatusService(
        cfg('http://waha:3000'),
        nadaFaz,
        semTelegram,
        () => e.s,
      );
      o.onModuleInit();
      e.h.abrir?.();

      jest.advanceTimersByTime(90_000);

      expect(e.derrubado).toBe(true);
      o.onModuleDestroy();
    });
  });
});
