import {
  contatoDoEvento,
  extrairMensagemRecebida,
  formatoDoRemetente,
  telefoneDoIdentificador,
} from './waha-webhook';

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

/**
 * O `@lid` NO LUGAR DO TELEFONE — 29/09/2026.
 *
 * ==========================================================================
 * O DEFEITO QUE NAO APARECIA EM LUGAR NENHUM.
 *
 * Com o numero corporativo da vendedora conectado, TODA mensagem de cliente
 * sumia: o WhatsApp comercial passou a mandar o remetente como `@lid` — um
 * identificador que nao contem telefone — e o extrator so aceitava `@c.us`.
 * Descartava calado.
 *
 * O painel dizia "Conectado · sincronizado agora", o WAHA dizia `WORKING`, a
 * mensagem saia com dois tiques, e nada era registrado. Levou uma manha de
 * 29/09 para achar, com log temporario, porque nenhum sintoma apontava para ca.
 *
 * Estes testes existem para que a proxima pessoa nao gaste a mesma manha.
 * ==========================================================================
 */
describe('o telefone por tras do identificador', () => {
  // O evento real capturado em 29/09/2026 (numeros trocados).
  const INFO_LID = {
    Chat: '111111111111111@lid',
    Sender: '222222222222222@lid',
    SenderAlt: '558598490118:15@s.whatsapp.net',
  };

  describe('o caminho de sempre', () => {
    it('`@c.us` continua saindo direto, sem olhar o Info', () => {
      expect(telefoneDoIdentificador('5585999990001@c.us', undefined, false))
        .toBe('5585999990001');
    });

    it('`@s.whatsapp.net` tambem serve — e o mesmo telefone', () => {
      expect(telefoneDoIdentificador('5585999990001@s.whatsapp.net', undefined, false))
        .toBe('5585999990001');
    });
  });

  describe('o `@lid`, que nao tem telefone nenhum', () => {
    it('recebendo, o telefone sai do SenderAlt', () => {
      expect(telefoneDoIdentificador('222222222222222@lid', INFO_LID, false))
        .toBe('558598490118');
    });

    it('enviando, sai do campo espelho do destinatario', () => {
      const info = { RecipientAlt: '558598490118:3@s.whatsapp.net' };
      expect(telefoneDoIdentificador('222222222222222@lid', info, true))
        .toBe('558598490118');
    });

    /* O SENTIDO IMPORTA. Ler o SenderAlt quando a VENDEDORA escreve devolveria
     * o telefone DELA no lugar do da cliente — e o atendimento seria aberto
     * contra a pessoa errada, sem erro nenhum aparecer. */
    it('enviando NAO cai no SenderAlt, que e a propria vendedora', () => {
      expect(telefoneDoIdentificador('222222222222222@lid', INFO_LID, true))
        .toBeNull();
    });

    it('`@lid` sem campo espelho devolve null — e ai o log entra', () => {
      expect(telefoneDoIdentificador('222222222222222@lid', { Sender: 'x@lid' }, false))
        .toBeNull();
      expect(telefoneDoIdentificador('222222222222222@lid', undefined, false))
        .toBeNull();
    });
  });

  /*
   * O `:15` E O APARELHO, E NAO PARTE DO NUMERO.
   *
   * O mesmo contato manda do celular (`:15`) e do WhatsApp Web (`:3`). Deixar
   * o sufixo entrar criaria um cliente por aparelho, e a cliente seria
   * perguntada de novo em cada um — sem nada parecer quebrado.
   */
  describe('o sufixo de aparelho', () => {
    it.each([
      ['558598490118:15@s.whatsapp.net', '558598490118'],
      ['558598490118:3@s.whatsapp.net', '558598490118'],
      ['558598490118@s.whatsapp.net', '558598490118'],
    ])('%s -> %s', (jid, esperado) => {
      expect(telefoneDoIdentificador(jid, undefined, false)).toBe(esperado);
    });

    it('dois aparelhos da mesma pessoa dao o MESMO telefone', () => {
      const celular = telefoneDoIdentificador('9@lid', { SenderAlt: '558598490118:15@s.whatsapp.net' }, false);
      const web = telefoneDoIdentificador('9@lid', { SenderAlt: '558598490118:3@s.whatsapp.net' }, false);
      expect(celular).toBe(web);
    });
  });

  describe('o que continua fora', () => {
    it('grupo nao e atendimento', () => {
      expect(contatoDoEvento({
        event: 'message.any',
        payload: { from: '123456789@g.us', fromMe: false },
      })).toBeNull();
    });

    it.each(['', 'abc@c.us', '123@c.us', '1234567890123456@c.us'])(
      'identificador que nao e telefone (%s) nao passa',
      (id) => {
        expect(telefoneDoIdentificador(id, undefined, false)).toBeNull();
      },
    );
  });

  describe('o evento inteiro, de ponta a ponta', () => {
    it('o evento REAL de 29/09 agora vira contato', () => {
      const contato = contatoDoEvento({
        event: 'message.any',
        session: 'vend-9ef62011-af97-4bde-83d8-a63142b45c73',
        payload: {
          from: '222222222222222@lid',
          fromMe: false,
          timestamp: 1790931534,
          _data: { Info: INFO_LID },
        },
      });

      expect(contato).toEqual({
        telefone: '558598490118',
        daVendedora: false,
        em: new Date(1790931534 * 1000),
      });
    });
  });
});

describe('o formato do remetente, para o log', () => {
  it.each([
    [{ payload: { from: 'x@lid', fromMe: false } }, '@lid'],
    [{ payload: { from: 'x@c.us', fromMe: false } }, '@c.us'],
    [{ payload: { to: 'x@s.whatsapp.net', fromMe: true } }, '@s.whatsapp.net'],
    [{ payload: { fromMe: false } }, 'ausente'],
    [{}, 'ausente'],
  ])('%j -> %s', (body, esperado) => {
    expect(formatoDoRemetente(body)).toBe(esperado);
  });

  /* O LOG NAO PODE VAZAR O NUMERO. Ele existe para dizer QUE formato chegou,
   * e nao QUEM escreveu — e um log de webhook e lido por muita gente. */
  it('nao devolve digito nenhum do telefone', () => {
    const saida = formatoDoRemetente({
      payload: { from: '558598490118@c.us', fromMe: false },
    });
    expect(saida).not.toMatch(/\d/);
  });
});

/**
 * O LADO DA VENDEDORA — 29/09/2026, mesma manha, defeito seguinte.
 *
 * ==========================================================================
 * O `to` DE SAIDA NAO E STRING.
 *
 * Consertado o `@lid` de entrada, a mensagem da CLIENTE passou a registrar e a
 * da VENDEDORA nao. O log dizia "remetente ausente" — e era mentira: o campo
 * existia, so que como OBJETO. O extrator testava `typeof === 'string'` e
 * desistia antes de olhar o `Info`.
 *
 * Sem este lado, o sistema enxerga a cliente escrevendo e NUNCA sendo
 * respondida — e o tempo de primeira resposta (ANA-09) nasceria errado para
 * todo mundo, sem nada parecer quebrado.
 * ==========================================================================
 */
describe('os dois sentidos da conversa', () => {
  const CLIENTE = '558599990001';
  const VENDEDORA = '558598490118';

  /** Como o WAHA manda quando a CLIENTE escreve (evento real de 29/09). */
  const recebendo = {
    event: 'message.any',
    session: 'vend-9ef62011-af97-4bde-83d8-a63142b45c73',
    payload: {
      from: '222222222222222@lid',
      fromMe: false,
      timestamp: 1790931534,
      _data: {
        Info: {
          Chat: '111111111111111@lid',
          Sender: '222222222222222@lid',
          SenderAlt: `${CLIENTE}:15@s.whatsapp.net`,
          IsGroup: false,
        },
      },
    },
  };

  /** Como o WAHA manda quando a VENDEDORA responde: `to` e OBJETO. */
  const enviando = {
    event: 'message.any',
    session: 'vend-9ef62011-af97-4bde-83d8-a63142b45c73',
    payload: {
      to: { _serialized: '111111111111111@lid', server: 'lid' },
      fromMe: true,
      timestamp: 1790931600,
      _data: {
        Info: {
          Chat: '111111111111111@lid',
          Sender: `${VENDEDORA}@s.whatsapp.net`,
          SenderAlt: `${VENDEDORA}:15@s.whatsapp.net`,
          RecipientAlt: `${CLIENTE}:3@s.whatsapp.net`,
          IsGroup: false,
        },
      },
    },
  };

  it('a cliente escrevendo e reconhecida', () => {
    expect(contatoDoEvento(recebendo)).toMatchObject({
      telefone: CLIENTE,
      daVendedora: false,
    });
  });

  it('a vendedora respondendo TAMBEM e — mesmo com `to` objeto', () => {
    expect(contatoDoEvento(enviando)).toMatchObject({
      telefone: CLIENTE,
      daVendedora: true,
    });
  });

  /*
   * ESTE E O TESTE QUE IMPORTA.
   *
   * Os dois sentidos tem de dar o telefone DA CLIENTE. Se o lado de saida
   * pegasse o `SenderAlt` — que ali e a propria vendedora — a conversa viraria
   * DUAS, e foi exatamente o que aconteceu no teste ao vivo de 29/09 antes
   * deste conserto.
   */
  it('ida e volta caem na MESMA conversa', () => {
    const ida = contatoDoEvento(recebendo);
    const volta = contatoDoEvento(enviando);

    expect(ida?.telefone).toBe(volta?.telefone);
    expect(ida?.telefone).not.toBe(VENDEDORA);
  });

  /*
   * A ARMADILHA DOS QUINZE DIGITOS.
   *
   * `158205808246878@lid` tem quinze digitos e passaria por qualquer teste de
   * "parece telefone". Aceita-lo criaria um cliente fantasma, com atendimento
   * e tudo, e ninguem descobriria olhando a tela.
   */
  it('um `@lid` de 15 digitos NAO vira telefone', () => {
    expect(telefoneDoIdentificador('158205808246878@lid', undefined, false)).toBeNull();

    const soComLid = contatoDoEvento({
      event: 'message.any',
      payload: {
        from: '158205808246878@lid',
        fromMe: false,
        _data: { Info: { Chat: '111111111111111@lid', IsGroup: false } },
      },
    });
    expect(soComLid).toBeNull();
  });

  it('grupo continua fora, pelo `IsGroup` do proprio WAHA', () => {
    expect(contatoDoEvento({
      event: 'message.any',
      payload: {
        from: '222222222222222@lid',
        fromMe: false,
        _data: { Info: { ...recebendo.payload._data.Info, IsGroup: true } },
      },
    })).toBeNull();
  });
});
