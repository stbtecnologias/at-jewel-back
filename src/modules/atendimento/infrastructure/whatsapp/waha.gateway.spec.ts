import { ConfigService } from '@nestjs/config';
import { LimiteDeEnvioService } from '../../application/limite-de-envio.service';
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
    gateway = new WahaGateway(
      config,
      new SessoesDaCasaService(config),
      new LimiteDeEnvioService(config),
    );

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

      const semNada = new WahaGateway(
        semConfig,
        new SessoesDaCasaService(semConfig),
        new LimiteDeEnvioService(semConfig),
      );

      expect(await semNada.resolverRemetente('278266435@lid')).toBe(
        '278266435@lid',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

/**
 * ==========================================================================
 * O LID E POR CONTA — e foi por isso que a Helena ficou muda. 07/10/2026.
 *
 * A Nathalia escreveu para a Helena (a `ELENA` do codigo) e nao recebeu
 * nada. O Lucas, do proprio numero, foi respondido; no ambiente local,
 * tambem. Mesmo destino, remetentes diferentes, resultados diferentes.
 *
 * A traducao de LID perguntava SEMPRE pela sessao da Anastasia, com a
 * justificativa escrita no codigo de que "o LID e do contato, nao do numero
 * da casa: a resposta e a mesma pelos dois". A premissa estava errada — o
 * mapa de LIDs so tem quem AQUELA conta ja viu. O LID da Nathalia nunca
 * tinha passado pela Anastasia; o do Lucas sim, porque ele fala com ela. No
 * local ha uma conta so, entao o mapa era o mesmo e nada aparecia.
 *
 * O 404 virava o proprio LID de volta, o LID nao casa com telefone nenhum no
 * cadastro, e o canal e default-deny: silencio, sem erro em lugar nenhum.
 * ==========================================================================
 */
describe('WahaGateway.resolverRemetente — com os dois numeros da casa', () => {
  const CONFIG = {
    WAHA_BASE_URL: 'https://waha.exemplo.com',
    WAHA_API_KEY: 'chave',
    WAHA_SESSION: 'anastasia',
    WAHA_SESSION_ELENA: 'elena',
  } as Record<string, string>;

  let gateway: WahaGateway;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    const config = {
      get: jest.fn((k: string) => CONFIG[k]),
    } as unknown as ConfigService;
    gateway = new WahaGateway(
      config,
      new SessoesDaCasaService(config),
      new LimiteDeEnvioService(config),
    );
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => jest.restoreAllMocks());

  const ok = (corpo: unknown) => ({ ok: true, status: 200, json: async () => corpo });
  const naoAchou = { ok: false, status: 404, json: async () => ({}) };
  const sessaoDaUrl = (url: string) => /\/api\/([^/]+)\/lids\//.exec(url)?.[1];

  /* ESTE E O TESTE. O resto e contorno. */
  it('pergunta a sessao POR ONDE a mensagem chegou', async () => {
    fetchMock.mockResolvedValue(ok({ pn: '558586467241@c.us' }));

    await gateway.resolverRemetente('278266435@lid', 'ELENA');

    expect(sessaoDaUrl(fetchMock.mock.calls[0][0])).toBe('elena');
  });

  it('e a da Anastasia quando foi por la que chegou', async () => {
    fetchMock.mockResolvedValue(ok({ pn: '558586467241@c.us' }));

    await gateway.resolverRemetente('278266435@lid', 'ANASTASIA');

    expect(sessaoDaUrl(fetchMock.mock.calls[0][0])).toBe('anastasia');
  });

  /**
   * O caso real: a conta de origem ainda nao viu aquele LID, mas a irma viu.
   * Desistir na primeira trocaria um silencio por outro.
   */
  it('nao achando na primeira, tenta a outra sessao da casa', async () => {
    fetchMock
      .mockResolvedValueOnce(naoAchou)
      .mockResolvedValueOnce(ok({ pn: '558586467241@c.us' }));

    const r = await gateway.resolverRemetente('278266435@lid', 'ELENA');

    expect(r).toBe('558586467241@c.us');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sessaoDaUrl(fetchMock.mock.calls[0][0])).toBe('elena');
    expect(sessaoDaUrl(fetchMock.mock.calls[1][0])).toBe('anastasia');
  });

  it('achando na primeira, NAO consulta a segunda', async () => {
    fetchMock.mockResolvedValue(ok({ pn: '558586467241@c.us' }));

    await gateway.resolverRemetente('278266435@lid', 'ELENA');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('nenhuma sabendo, devolve o LID — silencio, e nao identidade errada', async () => {
    fetchMock.mockResolvedValue(naoAchou);

    const r = await gateway.resolverRemetente('278266435@lid', 'ELENA');

    expect(r).toBe('278266435@lid');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /**
   * Sem o agente, o comportamento tem de continuar o de antes — a Anastasia
   * primeiro. Chamada antiga que fique para tras nao pode piorar.
   */
  it('sem agente, comeca pela Anastasia', async () => {
    fetchMock.mockResolvedValue(ok({ pn: '558586467241@c.us' }));

    await gateway.resolverRemetente('278266435@lid');

    expect(sessaoDaUrl(fetchMock.mock.calls[0][0])).toBe('anastasia');
  });
});
