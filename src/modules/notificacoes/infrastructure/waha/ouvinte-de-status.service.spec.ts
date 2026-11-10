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
 * Medido no WAHA local (2026.8.2, GOWS, CORE): uma sessao criada com
 * `webhooks: []` — nenhum webhook configurado — ainda assim teve os eventos
 * `session.status` entregues pelo canal `/ws`. E por isso que este caminho
 * foi escolhido: nenhuma sessao e reescrita, e reescrever a config de uma
 * sessao a REINICIA — em chip sem aparelho, isso significa QR novo.
 *
 * A CHAVE VAI NO CABECALHO. O `WebSocket` embutido do Node 22 nao aceita
 * cabecalho, e a chave teria de viajar na query string, onde aparece em log
 * de acesso. E o unico motivo de existir a dependencia `ws` — e ha teste so
 * para isso.
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
}

function sockete(): { s: SocketDoWaha; h: Pontas } {
  const h: Pontas = {};
  const s: SocketDoWaha = {
    aoAbrir: (f) => (h.abrir = f),
    aoReceber: (f) => (h.receber = f),
    aoFechar: (f) => (h.fechar = f),
    fechar: () => undefined,
  };
  return { s, h };
}

const EVENTO = JSON.stringify({
  event: 'session.status',
  session: 'default',
  me: null,
  payload: { status: 'FAILED' },
});

const nadaFaz = { executar: async () => undefined } as never;

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
      {} as never,
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
      {} as never,
      fabrica,
    );
    o.onModuleInit();

    expect(url).toBe(
      'ws://waha:3000/ws?events=session.status&x-api-key=chave',
    );
    o.onModuleDestroy();
  });

  it('evento valido chega no caso de uso', async () => {
    const vistos: Array<{ sessao: string; status: string }> = [];
    const { s, h } = sockete();

    const o = new OuvinteDeStatusService(
      cfg('http://waha:3000'),
      {
        executar: async (e: { sessao: string; status: string }) => {
          vistos.push(e);
        },
      } as never,
      {} as never,
      () => s,
    );
    o.onModuleInit();
    await h.receber?.(EVENTO);

    expect(vistos[0].sessao).toBe('default');
    expect(vistos[0].status).toBe('FAILED');
    o.onModuleDestroy();
  });

  it('JSON quebrado e evento sem status nao estouram', async () => {
    const { s, h } = sockete();
    const quebra = {
      executar: async () => {
        throw new Error('nunca deveria ser chamado');
      },
    } as never;

    const o = new OuvinteDeStatusService(
      cfg('http://waha:3000'),
      quebra,
      {} as never,
      () => s,
    );
    o.onModuleInit();

    await expect(h.receber?.('{ isso nao e json')).resolves.toBeUndefined();
    await expect(
      h.receber?.(
        JSON.stringify({ event: 'session.status', session: 'x', payload: {} }),
      ),
    ).resolves.toBeUndefined();
    o.onModuleDestroy();
  });

  it('evento que nao e session.status e ignorado', async () => {
    const vistos: unknown[] = [];
    const { s, h } = sockete();

    const o = new OuvinteDeStatusService(
      cfg('http://waha:3000'),
      { executar: async (e: unknown) => void vistos.push(e) } as never,
      {} as never,
      () => s,
    );
    o.onModuleInit();
    await h.receber?.(
      JSON.stringify({ event: 'message', session: 'default', payload: {} }),
    );

    expect(vistos).toHaveLength(0);
    o.onModuleDestroy();
  });

  it('falha do caso de uso nao derruba o ouvinte', async () => {
    const { s, h } = sockete();
    const quebra = {
      executar: async () => {
        throw new Error('telegram fora');
      },
    } as never;

    const o = new OuvinteDeStatusService(
      cfg('http://waha:3000'),
      quebra,
      {} as never,
      () => s,
    );
    o.onModuleInit();

    await expect(h.receber?.(EVENTO)).resolves.toBeUndefined();
    o.onModuleDestroy();
  });

  it('o numero so viaja quando o WAHA manda `me`', async () => {
    const vistos: Array<{ numero: string | null }> = [];
    const { s, h } = sockete();

    const o = new OuvinteDeStatusService(
      cfg('http://waha:3000'),
      { executar: async (e: { numero: string | null }) => void vistos.push(e) } as never,
      {} as never,
      () => s,
    );
    o.onModuleInit();
    await h.receber?.(
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
});
