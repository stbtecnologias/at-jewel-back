import { LerConversaWhatsappUseCase } from './ler-conversa-whatsapp.use-case';

/**
 * O que estes testes protegem, em uma frase cada:
 *
 *   - assunto que nao e da loja NAO vira registro (pedido do Lucas, 09/09/2026)
 *   - numero desconhecido falando de joia vira LEAD, e nunca cliente
 *   - a marca d'agua so anda quando a leitura deu certo
 *   - nada nesta classe envia mensagem
 */
describe('LerConversaWhatsappUseCase', () => {
  const AGORA = new Date('2026-09-09T12:00:00-03:00');
  const T = (min: number) =>
    Math.floor((AGORA.getTime() + min * 60_000) / 1000);

  let conversas: {
    listarParaLeitura: jest.Mock;
    concluirLeitura: jest.Mock;
    registrarFalha: jest.Mock;
  };
  let atendimentos: {
    buscarAbertoPorCliente: jest.Mock;
    abrir: jest.Mock;
    criarInteracao: jest.Mock;
    fechar: jest.Mock;
  };
  let llm: { chat: jest.Mock };
  let waha: { mensagens: jest.Mock };
  let buscarCliente: { execute: jest.Mock };
  let registrarLead: { execute: jest.Mock };
  let uc: LerConversaWhatsappUseCase;

  const CONVERSA = {
    id: 'cv-1',
    vendedoraId: 'vd-aline',
    chatId: '5585988887777@c.us',
    clienteId: null,
    atendimentoId: null,
    leadId: null,
    ultimaMensagemEm: AGORA,
    lidaAte: null,
    lerEm: AGORA,
    estado: 'AGUARDANDO' as const,
    tentativas: 0,
  };

  const responde = (obj: unknown) =>
    llm.chat.mockResolvedValue({ texto: JSON.stringify(obj), tokens: 10 });

  beforeEach(() => {
    conversas = {
      listarParaLeitura: jest.fn().mockResolvedValue([CONVERSA]),
      concluirLeitura: jest.fn().mockResolvedValue(undefined),
      registrarFalha: jest.fn().mockResolvedValue(undefined),
    };
    atendimentos = {
      buscarAbertoPorCliente: jest.fn().mockResolvedValue(null),
      abrir: jest.fn().mockResolvedValue({ id: 'at-novo' }),
      criarInteracao: jest.fn().mockResolvedValue({ id: 'i-1' }),
      fechar: jest.fn().mockResolvedValue(undefined),
    };
    llm = { chat: jest.fn() };
    waha = {
      mensagens: jest.fn().mockResolvedValue([
        { texto: 'oi, tem brinco de ouro?', minha: false, timestamp: T(-30), temMidia: false },
        { texto: 'tenho sim!', minha: true, timestamp: T(-20), temMidia: false },
      ]),
    };
    buscarCliente = { execute: jest.fn().mockResolvedValue(null) };
    registrarLead = {
      execute: jest.fn().mockResolvedValue({ lead: { id: 'ld-1', clienteId: null } }),
    };

    uc = new LerConversaWhatsappUseCase(
      conversas as never,
      atendimentos as never,
      llm as never,
      { nomeDaSessao: (id: string) => `vend-${id}` } as never,
      waha as never,
      buscarCliente as never,
      registrarLead as never,
      {
        buscarPorId: jest.fn().mockResolvedValue({ codigoErp: 'AT-0001' }),
      } as never,
      { get: () => undefined } as never,
    );
  });

  it('assunto que nao e da loja nao vira lead nem atendimento', async () => {
    responde({
      sobre_joias: false,
      resultado: 'EM_ANDAMENTO',
      resumo: 'Assunto pessoal.',
      nome: null,
    });

    const r = await uc.execute();

    expect(registrarLead.execute).not.toHaveBeenCalled();
    expect(atendimentos.abrir).not.toHaveBeenCalled();
    expect(atendimentos.criarInteracao).not.toHaveBeenCalled();
    expect(r.ignoradas).toBe(1);
    // IGNORADA sai da fila; so mensagem nova a traz de volta, e com 24h.
    expect(conversas.concluirLeitura).toHaveBeenCalledWith(
      'cv-1',
      expect.objectContaining({ estado: 'IGNORADA', lerEm: null }),
    );
  });

  it('numero desconhecido falando de joia vira LEAD, nunca cliente', async () => {
    responde({
      sobre_joias: true,
      resultado: 'EM_ANDAMENTO',
      resumo: 'Perguntou por brincos de ouro.',
      nome: 'Carla',
    });

    await uc.execute();

    expect(registrarLead.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsapp: '5585988887777',
        nome: 'Carla',
        resumoTriagem: 'Perguntou por brincos de ouro.',
        // Ja nasce com dona: escreveu para a Aline, e da Aline.
        vendedoraSugeridaCodigo: 'AT-0001',
      }),
    );
    // NAO promove o lead: promover dispara WhatsApp para a gestao, e este
    // lead ja esta sendo atendido por quem recebeu a mensagem.
    expect(registrarLead.execute.mock.calls[0][0].prontoParaEncaminhar).toBeUndefined();
    // Sem cliente, nao ha atendimento: atendimento exige cadastro.
    expect(atendimentos.abrir).not.toHaveBeenCalled();
    expect(conversas.concluirLeitura).toHaveBeenCalledWith(
      'cv-1',
      expect.objectContaining({ leadId: 'ld-1' }),
    );
  });

  it('prospeccao ativa: so a vendedora falou, e mesmo assim vira lead', async () => {
    // O caso do Lucas em 09/09/2026: ele mandou o catalogo para um numero que
    // nao esta na base e ninguem respondeu. Se so contasse quem PROCURA a
    // vendedora, o trabalho dela de sair atras do cliente nao existiria em
    // lugar nenhum.
    waha.mensagens.mockResolvedValue([
      {
        texto: 'Bom dia. Estou com um novo catalogo de joias, tem um horario para falarmos?',
        minha: true,
        timestamp: T(-30),
        temMidia: false,
      },
    ]);
    responde({
      sobre_joias: true,
      resultado: 'EM_ANDAMENTO',
      resumo: 'Ofereceu o catalogo novo e aguarda resposta.',
      nome: null,
    });

    await uc.execute();

    const enviado = llm.chat.mock.calls[0][0].mensagens[0].content as string;
    expect(enviado).toContain('VENDEDORA:');
    expect(registrarLead.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsapp: '5585988887777',
        vendedoraSugeridaCodigo: 'AT-0001',
      }),
    );
  });

  it('cliente conhecida: abre atendimento e grava a leitura como relato', async () => {
    conversas.listarParaLeitura.mockResolvedValue([
      { ...CONVERSA, clienteId: 'cli-9' },
    ]);
    responde({
      sobre_joias: true,
      resultado: 'EM_ANDAMENTO',
      resumo: 'Pediu foto de alianca.',
      nome: null,
    });

    await uc.execute();

    expect(atendimentos.abrir).toHaveBeenCalledWith({
      clienteId: 'cli-9',
      vendedoraId: 'vd-aline',
    });
    expect(atendimentos.criarInteracao).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'RELATO', relato: 'Pediu foto de alianca.' }),
    );
    expect(atendimentos.fechar).not.toHaveBeenCalled();
    expect(registrarLead.execute).not.toHaveBeenCalled();
  });

  it('VENDA na conversa fecha o atendimento sozinho', async () => {
    conversas.listarParaLeitura.mockResolvedValue([
      { ...CONVERSA, clienteId: 'cli-9' },
    ]);
    atendimentos.buscarAbertoPorCliente.mockResolvedValue({ id: 'at-7' });
    responde({
      sobre_joias: true,
      resultado: 'VENDA',
      resumo: 'Fechou o par de brincos.',
      nome: null,
    });

    await uc.execute();

    expect(atendimentos.abrir).not.toHaveBeenCalled();
    expect(atendimentos.fechar).toHaveBeenCalledWith('at-7', 'VENDA');
  });

  it('so o trecho novo vai para o modelo — a marca dagua corta o resto', async () => {
    conversas.listarParaLeitura.mockResolvedValue([
      { ...CONVERSA, lidaAte: new Date(T(-25) * 1000) },
    ]);
    responde({
      sobre_joias: true,
      resultado: 'EM_ANDAMENTO',
      resumo: 'Seguiu a conversa.',
      nome: null,
    });

    await uc.execute();

    const enviado = llm.chat.mock.calls[0][0].mensagens[0].content as string;
    expect(enviado).toContain('tenho sim!');
    expect(enviado).not.toContain('tem brinco de ouro?');
  });

  it('sem mensagem nova, nao chama o modelo e nao mexe no julgamento', async () => {
    conversas.listarParaLeitura.mockResolvedValue([
      { ...CONVERSA, estado: 'IGNORADA', lidaAte: new Date(T(10) * 1000) },
    ]);

    await uc.execute();

    expect(llm.chat).not.toHaveBeenCalled();
    expect(conversas.concluirLeitura).toHaveBeenCalledWith(
      'cv-1',
      expect.objectContaining({ estado: 'IGNORADA' }),
    );
  });

  it('falha no modelo NAO move a marca dagua', async () => {
    llm.chat.mockRejectedValue(new Error('sem credito'));

    await uc.execute();

    expect(conversas.concluirLeitura).not.toHaveBeenCalled();
    expect(conversas.registrarFalha).toHaveBeenCalledWith('cv-1', expect.any(Date));
  });

  it('resposta fora do formato e tratada como falha, nao como conversa vazia', async () => {
    llm.chat.mockResolvedValue({ texto: 'claro! aqui vai:', tokens: 5 });

    await uc.execute();

    expect(conversas.concluirLeitura).not.toHaveBeenCalled();
    expect(conversas.registrarFalha).toHaveBeenCalled();
  });

  it('depois de tres falhas a conversa sai da fila', async () => {
    conversas.listarParaLeitura.mockResolvedValue([{ ...CONVERSA, tentativas: 2 }]);
    llm.chat.mockRejectedValue(new Error('sem credito'));

    await uc.execute();

    expect(conversas.registrarFalha).toHaveBeenCalledWith('cv-1', null);
  });

  it('uma conversa quebrada nao derruba as outras da rodada', async () => {
    conversas.listarParaLeitura.mockResolvedValue([
      { ...CONVERSA, id: 'cv-ruim' },
      { ...CONVERSA, id: 'cv-boa', clienteId: 'cli-9' },
    ]);
    waha.mensagens
      .mockRejectedValueOnce(new Error('WAHA fora do ar'))
      .mockResolvedValueOnce([
        { texto: 'quero ver colares', minha: false, timestamp: T(-5), temMidia: false },
      ]);
    responde({
      sobre_joias: true,
      resultado: 'EM_ANDAMENTO',
      resumo: 'Pediu colares.',
      nome: null,
    });

    const r = await uc.execute();

    expect(r.falhas).toBe(1);
    expect(r.lidas).toBe(1);
    expect(atendimentos.criarInteracao).toHaveBeenCalledTimes(1);
  });
});
