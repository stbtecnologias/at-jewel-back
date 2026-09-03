import { EncaminharLeadUseCase } from './encaminhar-lead.use-case';
import type { Lead } from '../../../leads/domain/ports/repositories/lead-repository.port';

/**
 * O PASSO QUE FALTAVA ENTRE O AVISO E A VENDEDORA.
 *
 * O aviso da gestao termina perguntando "para qual vendedora encaminho?", e
 * ate 03/09/2026 a resposta nao tinha para onde ir: as duas ferramentas de
 * vendedora resolvem o cliente na tabela `clientes`, e lead novo nao esta la.
 *
 * O que estes testes protegem sao as invariantes que doem em producao:
 *
 *   - a ORDEM entre enviar e fechar o lead. Fechando antes, uma falha de
 *     WhatsApp tira o lead da fila sem ninguem ter sido avisado — e nao ha
 *     tela que mostre isso;
 *   - o TELEFONE na mensagem. Sem ele o pedido "entre em contato" nao tem como
 *     ser cumprido: o numero do lead esta cifrado numa tabela sem tela;
 *   - a AMBIGUIDADE virando pergunta com os nomes, e nao um palpite.
 */
describe('EncaminharLeadUseCase', () => {
  const LEAD = (over: Partial<Lead> = {}): Lead => ({
    id: 'lead-1',
    nome: 'Nick Tesla',
    apelido: null,
    whatsapp: '5585999998888',
    origemContato: 'instagram',
    ocasiao: 'NOIVADO',
    produtosDesejados: 'aneis de noivado',
    resumoTriagem: 'Nick procura anéis de noivado, aberto a sugestões.',
    vendedoraSugeridaCodigo: null,
    estado: 'READY_FOR_ROUTING',
    estadoAtualizadoEm: new Date(),
    clienteId: null,
    vinculadoEm: null,
    direcionadoGestaoEm: new Date(),
    vendedoraAprovadaCodigo: null,
    direcionadoVendedoraEm: null,
    fechadoEm: null,
    criadoEm: new Date(),
    ...over,
  });

  let leads: {
    listarAguardandoGestao: jest.Mock;
    encaminhar: jest.Mock;
  };
  let vendedoras: { buscarPorId: jest.Mock };
  let resolver: { execute: jest.Mock };
  let whatsapp: { resolverChatId: jest.Mock; enviarTexto: jest.Mock };
  let useCase: EncaminharLeadUseCase;

  beforeEach(() => {
    leads = {
      listarAguardandoGestao: jest.fn().mockResolvedValue([LEAD()]),
      encaminhar: jest.fn().mockResolvedValue(LEAD()),
    };
    vendedoras = {
      buscarPorId: jest.fn().mockResolvedValue({
        id: 'vd-1',
        nome: 'Thiago Souza',
        whatsappInterno: '5585911112222',
      }),
    };
    resolver = {
      execute: jest.fn().mockResolvedValue({
        status: 'ACHOU',
        id: 'vd-1',
        nome: 'Thiago Souza',
        codigoErp: 'SEED-VD02',
      }),
    };
    whatsapp = {
      resolverChatId: jest.fn().mockResolvedValue('5585911112222@c.us'),
      enviarTexto: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new EncaminharLeadUseCase(
      leads as never,
      vendedoras as never,
      resolver as never,
      whatsapp as never,
    );
  });

  it('com UM lead esperando, "manda pro Thiago" basta', async () => {
    // Exigir o nome do cliente de novo seria cobrar o que ela acabou de ler no
    // aviso.
    const r = await useCase.execute({ vendedora: 'Thiago' });

    expect(r.status).toBe('ENCAMINHADO');
    expect(leads.encaminhar).toHaveBeenCalledWith('lead-1', 'SEED-VD02');
  });

  it('a mensagem leva o telefone, e é o que a torna acionável', async () => {
    await useCase.execute({ vendedora: 'Thiago' });

    const [, texto] = whatsapp.enviarTexto.mock.calls[0] as [string, string];

    expect(texto).toContain('Nick Tesla');
    expect(texto).toContain('aneis de noivado — para noivado');
    expect(texto).toContain('Veio de: instagram');
    // O DDI sai: ela liga do celular dela, no Brasil.
    expect(texto).toContain('Entre em contato: (85) 99999-8888');
  });

  it('a sugestão NÃO vai para a vendedora', async () => {
    // Ela é conversa entre o sistema e o ADM. Chegando na vendedora, soaria
    // como se alguém tivesse duvidado dela.
    leads.listarAguardandoGestao.mockResolvedValue([
      LEAD({ vendedoraSugeridaCodigo: 'SEED-VD09' }),
    ]);

    await useCase.execute({ vendedora: 'Thiago' });

    const [, texto] = whatsapp.enviarTexto.mock.calls[0] as [string, string];
    expect(texto).not.toContain('SEED-VD09');
    expect(texto).not.toContain('Sugestão');
  });

  it('ENVIA antes de fechar o lead: falha de envio o mantém na fila', async () => {
    // A invariante mais cara daqui. Fechando primeiro, o lead sairia da fila
    // sem ninguém ter sido avisado — e nenhuma tela mostraria isso.
    whatsapp.enviarTexto.mockRejectedValue(new Error('WAHA fora do ar'));

    const r = await useCase.execute({ vendedora: 'Thiago' });

    expect(r.status).toBe('FALHA_ENVIO');
    expect(leads.encaminhar).not.toHaveBeenCalled();
  });

  it('sem lead na fila, não pergunta nada sobre vendedora', async () => {
    // Perguntar "qual Thiago?" seria cobrar uma escolha que não vai a lugar
    // nenhum.
    leads.listarAguardandoGestao.mockResolvedValue([]);

    const r = await useCase.execute({ vendedora: 'Thiago' });

    expect(r.status).toBe('NENHUM_LEAD');
    expect(resolver.execute).not.toHaveBeenCalled();
  });

  it('dois leads esperando: pergunta QUAL, dizendo os nomes', async () => {
    // "Qual deles?" sozinho é uma pergunta sem resposta possível.
    leads.listarAguardandoGestao.mockResolvedValue([
      LEAD({ id: 'l-1', nome: 'Nick Tesla' }),
      LEAD({ id: 'l-2', nome: 'Ana Prado' }),
    ]);

    const r = await useCase.execute({ vendedora: 'Thiago' });

    expect(r).toEqual({
      status: 'LEAD_AMBIGUO',
      nomes: ['Nick Tesla', 'Ana Prado'],
    });
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  it('com o nome do lead, escolhe entre os que esperam', async () => {
    leads.listarAguardandoGestao.mockResolvedValue([
      LEAD({ id: 'l-1', nome: 'Nick Tesla' }),
      LEAD({ id: 'l-2', nome: 'Ana Prado' }),
    ]);

    const r = await useCase.execute({ vendedora: 'Thiago', lead: 'ana' });

    expect(r.status).toBe('ENCAMINHADO');
    expect(leads.encaminhar).toHaveBeenCalledWith('l-2', 'SEED-VD02');
  });

  it('vendedora sem código do ERP não encaminha, e não manda mensagem solta', async () => {
    // `encaminhar` grava o CÓDIGO no lead. Mandar a mensagem sem registrar
    // deixaria o lead na fila para outra pessoa encaminhar de novo.
    resolver.execute.mockResolvedValue({
      status: 'ACHOU',
      id: 'vd-1',
      nome: 'Thiago Souza',
      codigoErp: null,
    });

    const r = await useCase.execute({ vendedora: 'Thiago' });

    expect(r.status).toBe('VENDEDORA_SEM_CODIGO');
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    expect(leads.encaminhar).not.toHaveBeenCalled();
  });

  it('vendedora sem WhatsApp interno: o lead continua esperando', async () => {
    vendedoras.buscarPorId.mockResolvedValue({
      id: 'vd-1',
      nome: 'Thiago Souza',
      whatsappInterno: null,
    });

    const r = await useCase.execute({ vendedora: 'Thiago' });

    expect(r.status).toBe('VENDEDORA_SEM_WHATSAPP');
    expect(leads.encaminhar).not.toHaveBeenCalled();
  });

  it('nome ambíguo de vendedora vira pergunta, e não palpite', async () => {
    resolver.execute.mockResolvedValue({
      status: 'AMBIGUA',
      nomes: ['Thiago Souza', 'Thiago Lima'],
    });

    const r = await useCase.execute({ vendedora: 'Thiago' });

    expect(r).toEqual({
      status: 'VENDEDORA_AMBIGUA',
      nomes: ['Thiago Souza', 'Thiago Lima'],
    });
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  it('lead sem nome informado ainda é encaminhável', async () => {
    // A pessoa some antes de dizer o nome, mas disse o que procura. O aviso
    // saiu assim, então o encaminhamento tem de aceitar o mesmo.
    leads.listarAguardandoGestao.mockResolvedValue([LEAD({ nome: null })]);

    const r = await useCase.execute({ vendedora: 'Thiago' });

    expect(r.status).toBe('ENCAMINHADO');
    const [, texto] = whatsapp.enviarTexto.mock.calls[0] as [string, string];
    expect(texto).toContain('Cliente sem nome informado');
  });
});
