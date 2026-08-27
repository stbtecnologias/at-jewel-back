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

    controller = new WhatsappWebhookController(
      triagem as never,
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
});
