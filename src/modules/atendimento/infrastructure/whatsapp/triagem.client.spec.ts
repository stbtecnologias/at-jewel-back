import { ConfigService } from '@nestjs/config';
import { TriagemClient } from './triagem.client';

/**
 * A TRIAGEM DESLIGADA — 24/09/2026.
 *
 * Decisao do cliente: a triagem sai e um fluxo novo sera desenhado. Ate la,
 * quem escreve para o numero da loja sem ser da casa nao recebe nada.
 *
 * ESTE SPEC EXISTE PARA O DIA EM QUE ALGUEM RELIGAR SEM QUERER. O
 * desligamento e uma constante dentro do `TriagemClient`, e nao a ausencia de
 * uma variavel de ambiente — configurar a URL de novo, em qualquer ambiente,
 * NAO pode voltar a mandar mensagem para a cliente. E isto que o primeiro
 * teste guarda.
 *
 * O segundo guarda a outra metade do pedido: NADA FOI APAGADO. O `encaminhar`
 * continua inteiro, para o desenho novo reaproveitar.
 */
describe('TriagemClient — desligada desde 24/09/2026', () => {
  const comUrl = () =>
    new TriagemClient({
      get: jest.fn((k: string) =>
        k === 'TRIAGEM_WEBHOOK_URL' ? 'https://atwpp.exemplo.com/webhook' : 'token',
      ),
    } as unknown as ConfigService);

  afterEach(() => jest.restoreAllMocks());

  it('nao esta disponivel NEM COM a URL configurada', () => {
    expect(comUrl().disponivel()).toBe(false);
  });

  /*
   * O caminho do repasse continua de pe: quem religar a constante encontra o
   * `encaminhar` funcionando, e nao um esqueleto para reescrever.
   */
  it('o repasse em si continua inteiro — nada foi apagado', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await comUrl().encaminhar({ event: 'message' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://atwpp.exemplo.com/webhook');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ event: 'message' });
  });
});
