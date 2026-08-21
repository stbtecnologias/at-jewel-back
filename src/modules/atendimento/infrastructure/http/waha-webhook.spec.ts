import { extrairMensagemRecebida } from './waha-webhook';

/**
 * O parser do webhook do WAHA.
 *
 * O QUE ESTES TESTES PROTEGEM: a fronteira entre "tem conteudo" e "ignora". Ate
 * 21/08/2026 qualquer mensagem sem `body` era descartada aqui — audio inclusive.
 * Quem mandava audio nao recebia nada e nao havia como saber por que. Os testes
 * abaixo fixam os dois lados: audio passa, foto e documento continuam nao
 * passando (senao mandariamos imagem para a transcricao e pagariamos por isso).
 *
 * O payload de audio deste arquivo foi copiado de uma mensagem REAL da sessao
 * de producao, em 21/08/2026.
 */
describe('extrairMensagemRecebida', () => {
  const audioReal = {
    event: 'message',
    session: 'default',
    payload: {
      from: '212515032166435@lid',
      fromMe: false,
      hasMedia: true,
      media: {
        url: 'http://waha:3000/api/files/default/AC50711AEEC8F54DBEC7093250F8FEAE.oga',
        mimetype: 'audio/ogg; codecs=opus',
      },
      _data: {
        Info: { Type: 'media', MediaType: 'ptt' },
        Message: {
          audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 5 },
        },
      },
    },
  };

  it('extrai texto de uma mensagem comum', () => {
    const r = extrairMensagemRecebida({
      event: 'message',
      payload: { from: '558586467241@c.us', body: 'bom dia' },
    });
    expect(r).toEqual({ de: '558586467241@c.us', texto: 'bom dia' });
    expect(r?.audio).toBeUndefined();
  });

  it('extrai o audio de uma mensagem de voz, com a URL do arquivo', () => {
    const r = extrairMensagemRecebida(audioReal);
    expect(r?.de).toBe('212515032166435@lid');
    expect(r?.texto).toBe('');
    expect(r?.audio).toEqual({
      url: 'http://waha:3000/api/files/default/AC50711AEEC8F54DBEC7093250F8FEAE.oga',
      mimetype: 'audio/ogg; codecs=opus',
      segundos: 5,
    });
  });

  it('reconhece o audio mesmo sem o arquivo, para nao ficar mudo', () => {
    // Acontece com o download de midia desligado no WAHA. Distinguir "audio sem
    // arquivo" de "nao ha audio" e o que permite responder "nao consegui ouvir"
    // em vez de silencio.
    const r = extrairMensagemRecebida({
      ...audioReal,
      payload: { ...audioReal.payload, media: null },
    });
    expect(r?.audio?.url).toBeNull();
    expect(r?.audio?.segundos).toBe(5);
  });

  it('ignora foto e documento — nao sao para transcrever', () => {
    const foto = {
      event: 'message',
      payload: {
        from: '558586467241@c.us',
        hasMedia: true,
        media: { url: 'http://waha:3000/api/files/default/x.jpg', mimetype: 'image/jpeg' },
        _data: { Info: { Type: 'media', MediaType: 'image' } },
      },
    };
    expect(extrairMensagemRecebida(foto)).toBeNull();
  });

  it('ignora o que ja ignorava: nossas mensagens, grupos e outros eventos', () => {
    expect(
      extrairMensagemRecebida({
        event: 'message',
        payload: { from: '558586467241@c.us', body: 'oi', fromMe: true },
      }),
    ).toBeNull();

    expect(
      extrairMensagemRecebida({
        event: 'message',
        payload: { from: '12345@g.us', body: 'oi' },
      }),
    ).toBeNull();

    expect(extrairMensagemRecebida({ event: 'message.ack', payload: {} })).toBeNull();
    expect(extrairMensagemRecebida(null)).toBeNull();
  });

  it('nao confunde audio de grupo — grupo continua fora', () => {
    const r = extrairMensagemRecebida({
      ...audioReal,
      payload: { ...audioReal.payload, from: '12345@g.us' },
    });
    expect(r).toBeNull();
  });
});
