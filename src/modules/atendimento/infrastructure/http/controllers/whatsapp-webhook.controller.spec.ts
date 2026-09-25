import { SessoesDaCasaService } from '../../../application/sessoes-da-casa.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

/**
 * O WEBHOOK COMO PORTA DOS DOIS PUBLICOS.
 *
 * Cliente, vendedora e gestao escrevem para o MESMO numero. O que este arquivo
 * protege e a divisao: quem e da casa continua sendo atendido AQUI, e so quem
 * nao e reconhecido segue para a triagem.
 *
 * Errar isso nos dois sentidos e grave e silencioso:
 *   - repassar demais  -> a Anastasia publica pergunta a uma VENDEDORA o que
 *     ela busca na A.T. Jewel (aconteceu de verdade em 20/08, com o Lucas)
 *   - repassar de menos -> o cliente escreve e nunca recebe nada
 */
describe('WhatsappWebhookController — porta dos dois publicos', () => {
  const CORPO = {
    event: 'message',
    session: 'default',
    payload: { from: '558598888777@c.us', body: 'oi' },
  };

  let processar: { execute: jest.Mock };
  let whatsapp: { resolverRemetente: jest.Mock; enviarTexto: jest.Mock };
  let triagem: { disponivel: jest.Mock; encaminhar: jest.Mock };
  let config: { get: jest.Mock };
  let conexoes: { vendedoraDaSessao: jest.Mock };
  /**
   * As sessoes da casa, DE VERDADE e nao dubladas — quem decide "e da casa?"
   * e o objeto real, e com ele dublado o teste do desvio nao provaria nada.
   * Um numero so por padrao: e o estado de producao ate o segundo chip.
   */
  let sessoes: SessoesDaCasaService;
  let registrarContato: { execute: jest.Mock };
  let controller: WhatsappWebhookController;

  beforeEach(() => {
    processar = { execute: jest.fn() };
    whatsapp = {
      resolverRemetente: jest.fn().mockResolvedValue('558598888777@c.us'),
      enviarTexto: jest.fn(),
    };
    triagem = {
      disponivel: jest.fn().mockReturnValue(true),
      encaminhar: jest.fn().mockResolvedValue(undefined),
    };
    config = { get: jest.fn().mockReturnValue('production') };
    conexoes = { vendedoraDaSessao: jest.fn().mockReturnValue('vd-1') };
    sessoes = new SessoesDaCasaService({
      get: (k: string) => (k === 'WAHA_SESSION' ? 'default' : undefined),
    } as never);
    registrarContato = {
      execute: jest.fn().mockResolvedValue({ registrado: true, atendimentoId: 'at-1', tipo: 'CONTATO_CLIENTE' }),
    };

    controller = new WhatsappWebhookController(
      triagem as never,
      conexoes as never,
      sessoes,
      registrarContato as never,
      processar as never,
      config as never,
      whatsapp as never,
    );
  });

  it('remetente desconhecido vai para a triagem', async () => {
    processar.execute.mockResolvedValue({
      resposta: null,
      motivo: 'ignorado_remetente_desconhecido',
    });

    const r = await controller.webhook(CORPO);

    expect(triagem.encaminhar).toHaveBeenCalledWith(CORPO);
    expect(r).toEqual({ ok: true, encaminhado: 'triagem' });
    // O back NAO responde por ele: quem fala com o cliente e a triagem.
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  /** O CORPO VAI COMO VEIO — inclusive a `session`, que diz por qual numero
   *  a triagem deve responder. Reempacotar aqui perderia isso. */
  it('repassa o corpo ORIGINAL, sem traduzir', async () => {
    processar.execute.mockResolvedValue({
      resposta: null,
      motivo: 'ignorado_remetente_desconhecido',
    });

    await controller.webhook(CORPO);

    const [enviado] = triagem.encaminhar.mock.calls[0];
    expect(enviado).toBe(CORPO);
    expect(enviado.session).toBe('default');
  });

  it('vendedora reconhecida e atendida AQUI, e nao vai para a triagem', async () => {
    processar.execute.mockResolvedValue({
      resposta: 'Sua agenda de hoje tem dois contatos.',
      motivo: 'conversa',
    });

    await controller.webhook(CORPO);

    expect(triagem.encaminhar).not.toHaveBeenCalled();
    expect(whatsapp.enviarTexto).toHaveBeenCalledWith(
      '558598888777@c.us',
      'Sua agenda de hoje tem dois contatos.',
      // `undefined` = um numero so, e ele responde por si. Com dois, aqui
      // viria o agente em que a mensagem entrou.
      undefined,
    );
  });

  /**
   * RECONHECIDO SEM RESPOSTA NAO E CLIENTE. Audio vazio ou mensagem em branco
   * de uma vendedora nao pode cair na triagem — ela receberia a saudacao da
   * Anastasia publica perguntando o que busca na loja.
   */
  it('reconhecido mas sem conteudo NAO vai para a triagem', async () => {
    processar.execute.mockResolvedValue({
      resposta: null,
      motivo: 'ignorado_sem_conteudo',
    });

    const r = await controller.webhook(CORPO);

    expect(triagem.encaminhar).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, ignorado: true, motivo: 'ignorado_sem_conteudo' });
  });

  it('sem triagem configurada, volta a ser silencio — como antes', async () => {
    triagem.disponivel.mockReturnValue(false);
    processar.execute.mockResolvedValue({
      resposta: null,
      motivo: 'ignorado_remetente_desconhecido',
    });

    const r = await controller.webhook(CORPO);

    expect(triagem.encaminhar).not.toHaveBeenCalled();
    expect(r.ignorado).toBe(true);
  });

  it('evento que nao e mensagem nem chega a ser roteado', async () => {
    const r = await controller.webhook({ event: 'message.ack', payload: {} });

    expect(processar.execute).not.toHaveBeenCalled();
    expect(triagem.encaminhar).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, ignorado: true });
  });

  /**
   * O `atwpp` responde de forma SINCRONA (chama o LLM antes do HTTP). Se o
   * webhook esperasse, o WAHA reenviaria o evento e a cliente receberia a
   * mesma pergunta duas vezes.
   */
  it('nao espera a triagem para devolver 200', async () => {
    let liberar: () => void = () => {};
    triagem.encaminhar.mockReturnValue(
      new Promise<void>((resolve) => {
        liberar = resolve;
      }),
    );
    processar.execute.mockResolvedValue({
      resposta: null,
      motivo: 'ignorado_remetente_desconhecido',
    });

    // Se houvesse `await` no repasse, esta promessa nao resolveria aqui.
    const r = await controller.webhook(CORPO);
    expect(r).toEqual({ ok: true, encaminhado: 'triagem' });

    liberar();
  });

  /**
   * ======================================================================
   * A SESSAO DA VENDEDORA NAO RECEBE RESPOSTA. NUNCA.
   *
   * Do outro lado do numero corporativo da Marina esta uma CLIENTE, e a
   * vendedora que fala com ela e a Marina. Se a IA responder ali, ela fala
   * por cima de uma pessoa, numa conversa que nao e nossa — e a cliente nao
   * tem como saber que trocou de interlocutor no meio.
   *
   * Estes testes existem porque a falha seria SILENCIOSA: tudo devolve 200,
   * ninguem reclama, e a descoberta viria pela cliente estranhando.
   * ======================================================================
   */
  describe('so a sessao da loja fala', () => {
    const DA_VENDEDORA = {
      event: 'message',
      session: 'vend-11111111-2222-3333-4444-555555555555',
      payload: { from: '558598888777@c.us', body: 'oi, tem esse anel?' },
    };

    it('registra o contato, mas nao roteia, nao responde e nao chama a triagem', async () => {
      const r = await controller.webhook(DA_VENDEDORA);

      expect(registrarContato.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          vendedoraId: 'vd-1',
          telefone: '558598888777',
          daVendedora: false,
        }),
      );
      expect(r).toEqual({ ok: true, registrado: true, motivo: 'CONTATO_CLIENTE' });
      expect(processar.execute).not.toHaveBeenCalled();
      expect(triagem.encaminhar).not.toHaveBeenCalled();
      expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    });

    /** A checagem vem ANTES do roteador — nem o LID chega a ser resolvido,
     *  que ja seria uma chamada ao WAHA por conta de mensagem alheia. */
    it('sai antes de resolver o remetente', async () => {
      await controller.webhook(DA_VENDEDORA);
      expect(whatsapp.resolverRemetente).not.toHaveBeenCalled();
    });

    /** Payload sem `session` e o formato antigo, de quando havia uma sessao
     *  so. Recusar quebraria o canal inteiro por versao de payload. */
    it('payload sem session continua sendo tratado como da loja', async () => {
      processar.execute.mockResolvedValue({
        resposta: null,
        motivo: 'ignorado_remetente_desconhecido',
      });

      await controller.webhook({
        event: 'message',
        payload: { from: '558598888777@c.us', body: 'oi' },
      });

      expect(processar.execute).toHaveBeenCalled();
    });

    /** O nome da sessao da loja vem do env, e nao e sempre "default". */
    it('respeita o WAHA_SESSION configurado', async () => {
      sessoes = new SessoesDaCasaService({
        get: (k: string) => (k === 'WAHA_SESSION' ? 'atjewel' : undefined),
      } as never);
      (controller as unknown as { sessoes: SessoesDaCasaService }).sessoes = sessoes;
      processar.execute.mockResolvedValue({
        resposta: null,
        motivo: 'ignorado_remetente_desconhecido',
      });

      // Com a loja em "atjewel", o antigo "default" deixa de ser dela:
      // vira sessao de vendedora, entao REGISTRA em vez de rotear.
      await controller.webhook(CORPO);
      expect(registrarContato.execute).toHaveBeenCalled();
      expect(processar.execute).not.toHaveBeenCalled();

      await controller.webhook({ ...CORPO, session: 'atjewel' });
      expect(processar.execute).toHaveBeenCalled();
    });
  });
});
