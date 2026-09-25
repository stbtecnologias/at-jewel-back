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

  it('traz o carimbo de quando a mensagem foi ESCRITA, em milissegundos', () => {
    // O relogio da aprovacao do catalogo (11/09/2026): uma afirmacao so
    // aprova foto que ja tinha chegado quando a pessoa escreveu. O WAHA manda
    // em segundos.
    const r = extrairMensagemRecebida({
      event: 'message',
      payload: {
        from: '558586467241@c.us',
        body: 'Aprova',
        timestamp: 1757521640,
      },
    });
    expect(r?.em).toBe(1_757_521_640_000);
  });

  it('sem carimbo no payload, `em` fica ausente — quem usa cai na hora de agora', () => {
    const r = extrairMensagemRecebida({
      event: 'message',
      payload: { from: '558586467241@c.us', body: 'Aprova' },
    });
    expect(r?.em).toBeUndefined();
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

  it('extrai a foto — com a legenda no mesmo campo do texto', () => {
    // Ate 28/08/2026 este teste garantia o contrario: foto era descartada.
    // Mudou junto com o catalogo, que precisa da peca fotografada. A LEGENDA
    // vem no mesmo campo body do texto comum — e por isso que a legenda
    // "0002 BR26252" chega como se fosse uma mensagem escrita.
    const foto = {
      event: 'message',
      payload: {
        from: '558586467241@c.us',
        body: '0002 BR26252',
        hasMedia: true,
        media: { url: 'http://waha:3000/api/files/default/x.jpg', mimetype: 'image/jpeg' },
        _data: { Info: { Type: 'media', MediaType: 'image' } },
      },
    };

    const r = extrairMensagemRecebida(foto);
    expect(r?.imagem?.url).toBe('http://waha:3000/api/files/default/x.jpg');
    expect(r?.imagem?.mimetype).toBe('image/jpeg');
    expect(r?.texto).toBe('0002 BR26252');
    expect(r?.audio).toBeUndefined();
  });

  it('documento e sticker continuam ignorados', () => {
    // Documento nao e foto de peca, e sticker nunca vai para catalogo.
    expect(
      extrairMensagemRecebida({
        event: 'message',
        payload: {
          from: '558586467241@c.us',
          hasMedia: true,
          media: { url: 'http://waha:3000/api/files/default/x.pdf', mimetype: 'application/pdf' },
          _data: { Info: { Type: 'media', MediaType: 'document' } },
        },
      }),
    ).toBeNull();
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

/**
 * O NOME DO EVENTO MUDA COM A VERSÃO DO WAHA — 25/09/2026.
 *
 * ==========================================================================
 * Este bloco existe por causa de um silêncio de produção que custou uma tarde.
 *
 * A sessão da Helena foi criada escutando `message.any`. O parser aceitava só
 * `message`, e:
 *
 *   local      WAHA 2026.8.2   entregava como `message`      -> respondia
 *   produção   WAHA 2026.9.1   entrega como `message.any`    -> descartado
 *
 * Mesmo código, mesma config, e a Helena muda só em produção. Sem erro em log
 * nenhum, porque descartar evento desconhecido é o comportamento certo para
 * status, ack e presença.
 *
 * O QUE ESTES TESTES PROTEGEM: que os dois nomes continuem valendo, e que
 * `fromMe` siga sendo quem filtra o que a agente não deve responder — e não o
 * nome do evento.
 * ==========================================================================
 */
describe('o nome do evento, nas duas versões do WAHA', () => {
  const corpo = (event: string | undefined) => ({
    ...(event ? { event } : {}),
    session: 'elena',
    payload: { from: '558586467241@c.us', fromMe: false, body: 'tem agenda?' },
  });

  it.each(['message', 'message.any', undefined])(
    'aceita o evento %s',
    (event) => {
      const r = extrairMensagemRecebida(corpo(event));

      expect(r).not.toBeNull();
      expect(r?.texto).toBe('tem agenda?');
    },
  );

  it('continua descartando o que não é mensagem', () => {
    expect(extrairMensagemRecebida(corpo('message.ack'))).toBeNull();
    expect(extrairMensagemRecebida(corpo('presence.update'))).toBeNull();
    expect(extrairMensagemRecebida(corpo('session.status'))).toBeNull();
  });

  /* `message.any` traz os dois sentidos, e a agente não pode responder ao que
   * ela mesma escreveu — quem filtra isso é o `fromMe`, não o evento. */
  it('no evento amplo, o que a própria agente enviou não vira mensagem', () => {
    const daAgente = {
      event: 'message.any',
      session: 'elena',
      payload: { from: '558586467241@c.us', fromMe: true, body: 'Oi, Aline!' },
    };

    expect(extrairMensagemRecebida(daAgente)).toBeNull();
  });
});
