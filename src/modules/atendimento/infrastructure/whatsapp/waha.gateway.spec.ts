import { ConfigService } from '@nestjs/config';
import { SessoesDaCasaService } from '../../application/sessoes-da-casa.service';
import { WahaGateway } from './waha.gateway';

/**
 * A traducao de LID para telefone.
 *
 * Em 20/08/2026 a resposta da vendedora chegava no back e ele nao a
 * reconhecia. O WhatsApp parou de mandar o numero de quem escreve: o `from` do
 * webhook vem como `Linked ID`, e o codigo calculava o HMAC do LID em vez do
 * HMAC do telefone. Como o canal e default-deny, o sintoma era silencio.
 */
describe('WahaGateway.resolverRemetente', () => {
  const CONFIG = {
    WAHA_BASE_URL: 'https://waha.exemplo.com',
    WAHA_API_KEY: 'chave',
    WAHA_SESSION: 'default',
  } as Record<string, string>;

  let gateway: WahaGateway;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    const config = {
      get: jest.fn((k: string) => CONFIG[k]),
    } as unknown as ConfigService;
    // O servico de sessoes vai INTEIRO, e nao dublado: e ele quem traduz
    // agente em sessao, e o teste perderia o sentido com a traducao falsa.
    gateway = new WahaGateway(config, new SessoesDaCasaService(config));

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => jest.restoreAllMocks());

  const ok = (corpo: unknown) => ({ ok: true, status: 200, json: async () => corpo });

  it('troca o LID pelo telefone que o WAHA devolve', async () => {
    fetchMock.mockResolvedValue(ok({ lid: '278266435@lid', pn: '558586467241@c.us' }));

    const r = await gateway.resolverRemetente('278266435@lid');

    expect(r).toBe('558586467241@c.us');
  });

  it('consulta a rota de LIDs da sessao, com a chave', async () => {
    fetchMock.mockResolvedValue(ok({ pn: '558586467241@c.us' }));

    await gateway.resolverRemetente('278266435@lid');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/default/lids/');
    expect(url).toContain(encodeURIComponent('278266435@lid'));
    expect(init.headers['X-Api-Key']).toBe('chave');
  });

  // Regressao: numero comum nao pode pagar uma ida ao WAHA a cada mensagem.
  it('devolve chat @c.us como veio, sem consultar nada', async () => {
    const r = await gateway.resolverRemetente('558586467241@c.us');

    expect(r).toBe('558586467241@c.us');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('quando a traducao falha, erra para o lado seguro', () => {
    // Devolver a entrada faz o remetente NAO ser reconhecido. Num canal
    // default-deny isso e silencio — melhor que atender alguem sem identidade.
    it('resposta de erro do WAHA', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      expect(await gateway.resolverRemetente('278266435@lid')).toBe('278266435@lid');
    });

    it('WAHA fora do ar', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      expect(await gateway.resolverRemetente('278266435@lid')).toBe('278266435@lid');
    });

    it('resposta sem o campo `pn`', async () => {
      fetchMock.mockResolvedValue(ok({ lid: '278266435@lid' }));

      expect(await gateway.resolverRemetente('278266435@lid')).toBe('278266435@lid');
    });

    it('sem configuracao do WAHA', async () => {
      const semConfig = { get: jest.fn(() => undefined) } as unknown as ConfigService;

      const semNada = new WahaGateway(semConfig, new SessoesDaCasaService(semConfig));

      expect(await semNada.resolverRemetente('278266435@lid')).toBe(
        '278266435@lid',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
