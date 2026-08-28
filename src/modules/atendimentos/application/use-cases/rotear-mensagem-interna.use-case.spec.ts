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
  const VENDEDORA = { id: 'vd-1', nome: 'Marina Albuquerque', codigoErp: 'SEED-VD01' };
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
  let canalCatalogo: { foto: jest.Mock; resposta: jest.Mock; temFotoEsperando: jest.Mock };
  let whatsapp: { baixarMidia: jest.Mock };
  let transcricao: { transcrever: jest.Mock; disponivel: jest.Mock };
  let useCase: RotearMensagemInternaUseCase;

  beforeEach(() => {
    identificarVendedora = { execute: jest.fn().mockResolvedValue(null) };
    identificarAdmin = { execute: jest.fn().mockResolvedValue(null) };
    canalVendedora = {
      execute: jest.fn().mockResolvedValue({ resposta: 'da elena', motivo: 'conversa' }),
    };
    canalGestao = {
      execute: jest.fn().mockResolvedValue({ resposta: 'da anastasia', motivo: 'conversa' }),
    };
    // Sem foto esperando por padrao: o fluxo de texto continua indo para os
    // dois agentes de sempre, que e o que os testes daqui verificam.
    canalCatalogo = {
      foto: jest.fn().mockResolvedValue({ resposta: 'foto guardada', motivo: 'foto_guardada' }),
      resposta: jest.fn().mockResolvedValue({ resposta: 'classificada', motivo: 'fotos_classificadas' }),
      temFotoEsperando: jest.fn(() => false),
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
      transcricao as never,
    );
  });

  it('vendedora vai para a Elena, e a gestao nem e consultada', async () => {
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);

    const r = await useCase.execute({ de: '558586467241@c.us', texto: 'minha agenda?' });

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

    await useCase.execute({ de: '558586467241@c.us', texto: 'oi', audio: AUDIO });

    expect(transcricao.transcrever).not.toHaveBeenCalled();
  });
});
