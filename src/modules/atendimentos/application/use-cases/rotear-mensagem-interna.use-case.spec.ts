import { RotearMensagemInternaUseCase } from './rotear-mensagem-interna.use-case';

/**
 * O roteador do canal interno.
 *
 * O QUE ESTES TESTES PROTEGEM sao duas invariantes que nao aparecem lendo o
 * codigo de cima para baixo:
 *
 * 1. A ORDEM. Vendedora e procurada ANTES da gestao. O papel VENDEDORA e opcao
 *    do seletor de usuarios, entao vendedora com login TEM linha em
 *    `admin_users`; invertida a ordem, bastaria ela cadastrar o proprio celular
 *    para cair no canal que enxerga a equipe inteira.
 *
 * 2. A CATRACA DO CUSTO. Transcricao so acontece depois de reconhecer alguem.
 *    Audio de estranho nao pode custar um centavo.
 */
describe('RotearMensagemInternaUseCase', () => {
  const VENDEDORA = {
    id: 'vd-1',
    nome: 'Marina Albuquerque',
    codigoErp: 'SEED-VD01',
  };
  const ADMIN = { id: 'ad-1', nome: 'Lucas Barbosa', role: 'ADMIN' };

  const AUDIO = {
    url: 'http://waha:3000/api/files/default/abc.oga',
    mimetype: 'audio/ogg; codecs=opus',
    segundos: 5,
  };

  let identificarVendedora: { execute: jest.Mock };
  let identificarAdmin: { execute: jest.Mock };
  let canalVendedora: { execute: jest.Mock };
  let canalGestao: { execute: jest.Mock };
  let canalCatalogo: {
    foto: jest.Mock;
    resposta: jest.Mock;
    temFotoEsperando: jest.Mock;
    temFotoEmAprovacao: jest.Mock;
    aprovacao: jest.Mock;
    temCodigoEsperando: jest.Mock;
    codigo: jest.Mock;
    buscarPeca: jest.Mock;
    conversa: jest.Mock;
  };
  let whatsapp: { baixarMidia: jest.Mock };
  let transcricao: { transcrever: jest.Mock; disponivel: jest.Mock };
  let useCase: RotearMensagemInternaUseCase;

  beforeEach(() => {
    identificarVendedora = { execute: jest.fn().mockResolvedValue(null) };
    identificarAdmin = { execute: jest.fn().mockResolvedValue(null) };
    canalVendedora = {
      execute: jest
        .fn()
        .mockResolvedValue({ resposta: 'da elena', motivo: 'conversa' }),
    };
    canalGestao = {
      execute: jest
        .fn()
        .mockResolvedValue({ resposta: 'da anastasia', motivo: 'conversa' }),
    };
    // Sem foto esperando por padrao: o fluxo de texto continua indo para os
    // dois agentes de sempre, que e o que os testes daqui verificam.
    canalCatalogo = {
      foto: jest.fn().mockResolvedValue({
        resposta: 'foto guardada',
        motivo: 'foto_guardada',
      }),
      resposta: jest.fn().mockResolvedValue({
        resposta: 'classificada',
        motivo: 'fotos_classificadas',
      }),
      temFotoEsperando: jest.fn(() => false),
      temFotoEmAprovacao: jest.fn(() => false),
      aprovacao: jest.fn().mockResolvedValue(null),
      temCodigoEsperando: jest.fn(() => false),
      codigo: jest.fn().mockResolvedValue(null),
      buscarPeca: jest.fn().mockResolvedValue(null),
      conversa: jest.fn().mockResolvedValue({
        resposta: 'do catalogo',
        motivo: 'catalogo_conversa',
      }),
    };
    whatsapp = { baixarMidia: jest.fn() };
    transcricao = { transcrever: jest.fn(), disponivel: jest.fn(() => true) };

    useCase = new RotearMensagemInternaUseCase(
      identificarVendedora as never,
      identificarAdmin as never,
      canalVendedora as never,
      canalGestao as never,
      canalCatalogo as never,
      whatsapp as never,
      transcricao,
    );
  });

  it('vendedora vai para a Elena, e a gestao nem e consultada', async () => {
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'minha agenda?',
    });

    expect(r.resposta).toBe('da elena');
    expect(canalGestao.execute).not.toHaveBeenCalled();
    // A ordem importa: nem chega a perguntar se ela e admin.
    expect(identificarAdmin.execute).not.toHaveBeenCalled();
  });

  it('quem e VENDEDORA e tambem tem login continua na Elena', async () => {
    // O caso que a ordem existe para resolver.
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({ de: '558586467241@c.us', texto: 'oi' });

    expect(r.resposta).toBe('da elena');
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('gestao vai para a Anastasia, com o nome de quem escreveu', async () => {
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'agenda da Marina?',
    });

    expect(r.resposta).toBe('da anastasia');
    expect(canalGestao.execute).toHaveBeenCalledWith({
      usuarioId: 'ad-1',
      nome: 'Lucas Barbosa',
      texto: 'agenda da Marina?',
    });
    expect(canalVendedora.execute).not.toHaveBeenCalled();
  });

  it('desconhecido: silencio, sem LLM nenhum', async () => {
    const r = await useCase.execute({ de: '5511999999999@c.us', texto: 'oi' });

    expect(r.resposta).toBeNull();
    expect(r.motivo).toBe('ignorado_remetente_desconhecido');
    expect(canalVendedora.execute).not.toHaveBeenCalled();
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('audio de desconhecido nao baixa nem transcreve — custo zero', async () => {
    const r = await useCase.execute({
      de: '5511999999999@c.us',
      texto: '',
      audio: AUDIO,
    });

    expect(r.resposta).toBeNull();
    expect(whatsapp.baixarMidia).not.toHaveBeenCalled();
    expect(transcricao.transcrever).not.toHaveBeenCalled();
  });

  it('audio da gestao vira texto e chega a Anastasia como se fosse digitado', async () => {
    identificarAdmin.execute.mockResolvedValue(ADMIN);
    whatsapp.baixarMidia.mockResolvedValue({
      conteudo: Buffer.from('ogg'),
      mimetype: 'audio/ogg',
    });
    transcricao.transcrever.mockResolvedValue('como foi a semana da equipe?');

    await useCase.execute({ de: '558586467241@c.us', texto: '', audio: AUDIO });

    expect(canalGestao.execute).toHaveBeenCalledWith({
      usuarioId: 'ad-1',
      nome: 'Lucas Barbosa',
      texto: 'como foi a semana da equipe?',
    });
  });

  it('audio da vendedora tambem vira texto antes de despachar', async () => {
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);
    whatsapp.baixarMidia.mockResolvedValue({
      conteudo: Buffer.from('ogg'),
      mimetype: 'audio/ogg',
    });
    transcricao.transcrever.mockResolvedValue('minha agenda hoje?');

    await useCase.execute({ de: '558586467241@c.us', texto: '', audio: AUDIO });

    expect(canalVendedora.execute).toHaveBeenCalledWith({
      de: '558586467241@c.us',
      texto: 'minha agenda hoje?',
    });
  });

  it('audio longo demais e recusado ANTES de baixar', async () => {
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: '',
      audio: { ...AUDIO, segundos: 600 },
    });

    expect(whatsapp.baixarMidia).not.toHaveBeenCalled();
    expect(r.motivo).toBe('audio_nao_entendido');
    expect(r.resposta).toContain('escrito');
  });

  it('texto digitado tem precedencia sobre audio', async () => {
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);

    await useCase.execute({
      de: '558586467241@c.us',
      texto: 'oi',
      audio: AUDIO,
    });

    expect(transcricao.transcrever).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Aprovacao da foto tratada
  // -------------------------------------------------------------------------

  it('com foto esperando aprovacao, o "aprovo" precede os dois agentes', async () => {
    canalCatalogo.temFotoEmAprovacao.mockReturnValue(true);
    canalCatalogo.aprovacao.mockResolvedValue({
      resposta: 'BR26252 aprovada',
      motivo: 'foto_aprovada',
    });
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'aprovo',
    });

    expect(r.motivo).toBe('foto_aprovada');
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('texto que nao era aprovacao volta para a Anastasia', async () => {
    // A invariante: `null` do canal de catalogo significa "nao era comigo".
    canalCatalogo.temFotoEmAprovacao.mockReturnValue(true);
    canalCatalogo.aprovacao.mockResolvedValue(null);
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'quanto vendi hoje?',
    });

    expect(r.resposta).toBe('da anastasia');
  });

  it('a catraca da aprovacao nao inverte a ordem: vendedora continua primeiro', async () => {
    // Sem nada pendente, nenhum lookup de admin acontece antes do de vendedora
    // — e o que impede vendedora com login de cair no canal amplo.
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);

    await useCase.execute({ de: '558586467241@c.us', texto: 'aprovo' });

    expect(identificarAdmin.execute).not.toHaveBeenCalled();
    expect(canalCatalogo.aprovacao).not.toHaveBeenCalled();
  });

  it('o codigo da peca precede os agentes, e nao vira pergunta de vendas', async () => {
    // O caso real de 01/09: a confirmação da foto convidava a mandar o código,
    // e o "BR26252" caía na Anastasia — que respondia que o código não dizia
    // nada sozinho.
    canalCatalogo.temCodigoEsperando.mockReturnValue(true);
    canalCatalogo.codigo.mockResolvedValue({
      resposta: 'BR26252 · BRINCO RUBI',
      motivo: 'codigo_anotado',
    });
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'Br26252',
    });

    expect(r.motivo).toBe('codigo_anotado');
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('a descricao da peca vira lista, e nao pergunta para a Anastasia', async () => {
    // Quem esta com a peca na mao nem sempre tem o codigo a vista.
    canalCatalogo.temCodigoEsperando.mockReturnValue(true);
    canalCatalogo.buscarPeca.mockResolvedValue({
      resposta: 'Achei 2. Qual delas?',
      motivo: 'busca_com_opcoes',
    });
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'anel de esmeralda ouro branco',
    });

    expect(r.motivo).toBe('busca_com_opcoes');
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('a busca e a ULTIMA a olhar: o `aprovo` nao vira termo de busca', async () => {
    // A ordem e o que torna a busca segura. Invertida, um "aprovo" com foto
    // esperando codigo seria procurado no catalogo de produtos.
    canalCatalogo.temCodigoEsperando.mockReturnValue(true);
    canalCatalogo.temFotoEmAprovacao.mockReturnValue(true);
    canalCatalogo.aprovacao.mockResolvedValue({
      resposta: 'BR26252 aprovada.',
      motivo: 'foto_aprovada',
    });
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'aprovo',
    });

    expect(r.motivo).toBe('foto_aprovada');
    expect(canalCatalogo.buscarPeca).not.toHaveBeenCalled();
  });

  it('texto que nao era busca nem veredito segue para a Anastasia', async () => {
    // A borda oposta, e a mais cara: engolir a pergunta dela faz a duvida
    // morrer sem nunca chegar a quem responde.
    canalCatalogo.temCodigoEsperando.mockReturnValue(true);
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'quanto vendi hoje?',
    });

    expect(canalCatalogo.buscarPeca).toHaveBeenCalled();
    expect(r.resposta).toBe('da anastasia');
  });

  it('o audio e transcrito UMA vez, mesmo passando pelo ramo do catalogo', async () => {
    // O ramo do catalogo resolve o texto; se ele nao guardasse o resultado, a
    // Anastasia mandaria transcrever de novo — e a chamada e paga.
    canalCatalogo.temFotoEmAprovacao.mockReturnValue(true);
    canalCatalogo.aprovacao.mockResolvedValue(null);
    identificarAdmin.execute.mockResolvedValue(ADMIN);
    whatsapp.baixarMidia.mockResolvedValue({
      conteudo: Buffer.from('ogg'),
      mimetype: 'audio/ogg',
    });
    transcricao.transcrever.mockResolvedValue('quanto vendi hoje?');

    await useCase.execute({ de: '558586467241@c.us', texto: '', audio: AUDIO });

    expect(transcricao.transcrever).toHaveBeenCalledTimes(1);
    expect(canalGestao.execute).toHaveBeenCalledWith(
      expect.objectContaining({ texto: 'quanto vendi hoje?' }),
    );
  });

  describe('quem cuida do catálogo tem casa', () => {
    const ESTOQUISTA = { id: 'ad-9', nome: 'Faby Rocha', role: 'ESTOQUISTA' };

    /** Reconhece só com a permissão de catálogo — nunca com a de gestão. */
    const soCatalogo = () =>
      identificarAdmin.execute.mockImplementation(
        (_tel: string, permissao?: string) =>
          Promise.resolve(permissao === 'catalogo:write' ? ESTOQUISTA : null),
      );

    it('texto do estoquista NÃO cai na triagem: vai para o canal do catálogo', async () => {
      // Até 03/09/2026 caía, e a Anastasia tentava qualificar a própria equipe
      // como cliente — o telefone do estoque virava lead na fila da gestão.
      soCatalogo();

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'oi, tudo bem?',
      });

      expect(r.motivo).toBe('catalogo_conversa');
      expect(canalCatalogo.conversa).toHaveBeenCalled();
      expect(canalGestao.execute).not.toHaveBeenCalled();
      expect(canalVendedora.execute).not.toHaveBeenCalled();
    });

    it('o ADMIN continua na Anastasia: a gestão vem ANTES do catálogo', async () => {
      // Ele tem as duas permissões. Invertida a ordem, o texto dele deixaria de
      // ser assunto da gestão — e a foto dele já ia para o catálogo pelo ramo
      // da imagem, que não muda.
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'quanto vendi hoje?',
      });

      expect(r.resposta).toBe('da anastasia');
      expect(canalCatalogo.conversa).not.toHaveBeenCalled();
    });

    it('desconhecido continua desconhecido', async () => {
      // A regressão que importa: abrir uma terceira porta não pode abrir a
      // primeira. Quem não é da casa segue sem resposta.
      const r = await useCase.execute({
        de: '558599990000@c.us',
        texto: 'oi',
      });

      expect(r.motivo).toBe('ignorado_remetente_desconhecido');
      expect(canalCatalogo.conversa).not.toHaveBeenCalled();
    });

    it('áudio do estoquista é transcrito — ele é da casa', async () => {
      soCatalogo();
      whatsapp.baixarMidia.mockResolvedValue({
        conteudo: Buffer.from('ogg'),
        mimetype: 'audio/ogg',
      });
      transcricao.transcrever.mockResolvedValue('preciso mandar umas fotos');

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: '',
        audio: AUDIO,
      });

      expect(r.motivo).toBe('catalogo_conversa');
    });
  });
});
