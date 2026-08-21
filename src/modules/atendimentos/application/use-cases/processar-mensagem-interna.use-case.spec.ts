import { ConfigService } from '@nestjs/config';
import type { ChatParams } from '../../../agentes/domain/ports/llm-client.port';
import { FerramentasVendedoraService } from '../ferramentas-vendedora.service';
import { ProcessarMensagemInternaUseCase } from './processar-mensagem-interna.use-case';

/**
 * O canal interno, agora com ferramentas.
 *
 * O QUE ESTES TESTES PROTEGEM nao e o texto da resposta — e a invariante de
 * escopo: as ferramentas recebem o `vendedoraId` resolvido do TELEFONE, por
 * closure, e nenhuma aceita "de quem" como parametro. Se um dia alguem
 * adicionar esse parametro "para facilitar", estes testes continuam passando e
 * o buraco entra sem ninguem ver — por isso o primeiro teste verifica que o id
 * usado e o da vendedora identificada, e nao um vindo de fora.
 */
describe('ProcessarMensagemInternaUseCase', () => {
  const VENDEDORA = {
    id: 'vd-1',
    nome: 'Marina Albuquerque',
    codigoErp: 'SEED-VD01',
    ativo: true,
  };

  let identificar: { execute: jest.Mock };
  let relato: { execute: jest.Mock };
  let agenda: { execute: jest.Mock };
  let desempenho: { vendas: jest.Mock; metas: jest.Mock };
  let produtos: { execute: jest.Mock };
  let carteira: { semComprar: jest.Mock; maioresCompradores: jest.Mock };
  let agendar: { execute: jest.Mock };
  let atendimentos: { buscarCobrancaAguardando: jest.Mock };
  let clientes: { buscarPorId: jest.Mock };
  let llm: { chatComFerramentas: jest.Mock; chat: jest.Mock };
  let whatsapp: { baixarMidia: jest.Mock };
  let transcricao: { transcrever: jest.Mock; disponivel: jest.Mock };
  let memoria: { carregar: jest.Mock; registrar: jest.Mock };
  let useCase: ProcessarMensagemInternaUseCase;

  beforeEach(() => {
    identificar = { execute: jest.fn().mockResolvedValue(VENDEDORA) };
    relato = { execute: jest.fn().mockResolvedValue({ status: 'SEM_PENDENCIA' }) };
    agenda = { execute: jest.fn().mockResolvedValue([]) };
    desempenho = {
      vendas: jest
        .fn()
        .mockResolvedValue({ quantidade: 3, receita: 12400, ticketMedio: 4133.33 }),
      metas: jest.fn().mockResolvedValue([]),
    };
    produtos = {
      execute: jest.fn().mockResolvedValue([
        {
          descricao: 'Brinco Vintage Esmeralda',
          categoria: 'Brinco',
          familia: 'Ouro Branco',
          codigo: 'SEED-P0002',
          precoVenda: 7490.37,
          emEstoque: 1,
        },
      ]),
    };
    carteira = {
      semComprar: jest.fn().mockResolvedValue([]),
      maioresCompradores: jest.fn().mockResolvedValue([]),
    };
    agendar = {
      execute: jest.fn().mockResolvedValue({
        status: 'AGENDADO',
        cliente: 'Helena Gomes',
        quando: new Date('2026-08-21T10:00:00-03:00'),
      }),
    };
    atendimentos = { buscarCobrancaAguardando: jest.fn().mockResolvedValue(null) };
    clientes = { buscarPorId: jest.fn().mockResolvedValue({ nome: 'Helena Gomes' }) };
    llm = {
      chatComFerramentas: jest.fn().mockResolvedValue({ texto: 'ok', tokens: 1 }),
      chat: jest.fn(),
    };
    // Audio: por padrao os testes mandam texto, entao nada disso e chamado.
    whatsapp = { baixarMidia: jest.fn() };
    transcricao = { transcrever: jest.fn(), disponivel: jest.fn(() => true) };
    // Sem memoria nos testes: cada caso e uma conversa nova, que e o que
    // isola o comportamento de uma mensagem so.
    memoria = { carregar: jest.fn(() => []), registrar: jest.fn() };

    // O servico de ferramentas entra DE VERDADE, montado sobre os mesmos
    // mocks. Assim as asseroes destes testes continuam valendo o que valiam:
    // elas verificam que a consulta recebeu o `vendedoraId` certo, e isso
    // agora acontece uma camada abaixo.
    const ferramentas = new FerramentasVendedoraService(
      agenda as never,
      desempenho as never,
      produtos as never,
      carteira as never,
      agendar as never,
      relato as never,
    );

    useCase = new ProcessarMensagemInternaUseCase(
      identificar as never,
      ferramentas,
      atendimentos as never,
      clientes as never,
      llm as never,
      whatsapp as never,
      transcricao as never,
      memoria as never,
      { get: jest.fn(() => undefined) } as unknown as ConfigService,
    );
  });

  /** Os parametros com que o agente foi chamado. */
  function params(): ChatParams {
    return llm.chatComFerramentas.mock.calls[0][0] as ChatParams;
  }

  describe('default-deny por remetente', () => {
    it('ignora em silencio quem nao e vendedora, sem chamar o LLM', async () => {
      identificar.execute.mockResolvedValue(null);

      const r = await useCase.execute({ de: '5585999999999@c.us', texto: 'oi' });

      expect(r).toEqual({
        resposta: null,
        motivo: 'ignorado_remetente_desconhecido',
      });
      // O ponto: nao e so nao responder. E nao deixar o texto chegar ao modelo.
      expect(llm.chatComFerramentas).not.toHaveBeenCalled();
    });

    it('identifica pelo telefone, sem o sufixo do WhatsApp', async () => {
      await useCase.execute({ de: '558586467241@c.us', texto: 'oi' });

      expect(identificar.execute).toHaveBeenCalledWith('558586467241');
    });
  });

  describe('escopo das ferramentas', () => {
    it('a agenda e sempre a da vendedora identificada', async () => {
      await useCase.execute({ de: '558586467241@c.us', texto: 'minha agenda?' });

      // A ferramenta recebe apenas o periodo — quem e ela ja esta fechado.
      await params().consultarAgenda!({ periodo: 'HOJE' });

      expect(agenda.execute).toHaveBeenCalledWith('vd-1', 'HOJE');
    });

    it('as vendas sao sempre as da vendedora identificada', async () => {
      await useCase.execute({ de: '558586467241@c.us', texto: 'quantas vendas fiz?' });

      await params().consultarVendas!({ periodo: 'SEMANA' });

      expect(desempenho.vendas).toHaveBeenCalledWith('vd-1', 'SEMANA');
    });

    it('as metas sao sempre as dela — a ferramenta nem recebe parametro', async () => {
      await useCase.execute({ de: '558586467241@c.us', texto: 'bati minha meta?' });

      await params().consultarMetas!();

      expect(desempenho.metas).toHaveBeenCalledWith('vd-1');
    });

    // Catalogo e da loja, entao esta ferramenta nao e restrita a pessoa. O
    // corte aqui e por CAMPO: custo e margem nao saem do use case.
    it('o produto que chega ao modelo nao carrega custo nem margem', async () => {
      await useCase.execute({ de: '558586467241@c.us', texto: 'quanto custa o brinco?' });

      const r = await params().consultarProdutos!({ busca: 'brinco' });

      expect(produtos.execute).toHaveBeenCalledWith('brinco');
      const linha = r.produtos[0].linha;
      expect(linha).toContain('7.490,37');
      expect(linha).toContain('1 em estoque');
      expect(linha).not.toMatch(/custo|margem/i);
    });

    // A carteira e por `codigo_erp` — o mesmo campo do avisar_vendedora.
    it('a carteira consultada e sempre a da vendedora identificada', async () => {
      await useCase.execute({ de: '558586467241@c.us', texto: 'quem está parado?' });

      await params().clientesSemComprar!({ meses: 6 });
      await params().melhoresClientes!({ categoria: 'Anel' });

      expect(carteira.semComprar).toHaveBeenCalledWith('SEED-VD01', 6);
      expect(carteira.maioresCompradores).toHaveBeenCalledWith('SEED-VD01', {
        categoria: 'Anel',
        ultimosMeses: undefined,
      });
    });

    // A UNICA ferramenta que escreve. O id e o codigo vem os dois do
    // telefone resolvido — o modelo so escolhe cliente e horario.
    it('agendar recebe a identidade dela, nunca uma vinda do texto', async () => {
      await useCase.execute({ de: '558586467241@c.us', texto: 'marca a Helena amanhã 10h' });

      const r = await params().agendarContato!({
        cliente: 'Helena',
        quandoIso: '2026-08-21T10:00:00-03:00',
      });

      expect(agendar.execute).toHaveBeenCalledWith(
        'vd-1',
        'SEED-VD01',
        'Helena',
        '2026-08-21T10:00:00-03:00',
      );
      expect(r.status).toBe('AGENDADO');
      expect(r.mensagem).toContain('Helena Gomes');
    });

    // A recusa nao pode contar que o cliente existe em outro lugar.
    it('cliente fora da carteira devolve a mesma coisa que nome errado', async () => {
      agendar.execute.mockResolvedValue({ status: 'CLIENTE_NAO_ENCONTRADO' });

      await useCase.execute({ de: '558586467241@c.us', texto: 'marca a Gabriela amanhã 10h' });
      const r = await params().agendarContato!({
        cliente: 'Gabriela',
        quandoIso: '2026-08-21T10:00:00-03:00',
      });

      expect(r.mensagem.toLowerCase()).toContain('não encontrei');
      expect(r.mensagem.toLowerCase()).not.toContain('outra vendedora');
    });

    it('o relato guarda a FRASE DELA, nao o que o modelo entendeu', async () => {
      const original = 'falei com ela, pediu para retornar amanhã às 10h';
      relato.execute.mockResolvedValue({ status: 'REGISTRADO', resposta: 'Anotei.' });

      const r = await useCase.execute({ de: '558586467241@c.us', texto: original });

      await params().registrarRelato!();

      expect(relato.execute).toHaveBeenCalledWith('vd-1', original);
      expect(r.motivo).toBe('conversa'); // marcado so depois da ferramenta rodar
    });
  });

  describe('contexto pre-carregado', () => {
    it('avisa o agente quando ha cobranca esperando, com o nome do cliente', async () => {
      atendimentos.buscarCobrancaAguardando.mockResolvedValue({
        interacao: { id: 'i1' },
        atendimento: { id: 'a1', clienteId: 'c1' },
      });

      await useCase.execute({ de: '558586467241@c.us', texto: 'oi' });

      expect(params().system).toContain('Helena Gomes');
      expect(params().system).toContain('registrar_relato');
    });

    it('sem cobranca aberta, manda NAO registrar relato', async () => {
      await useCase.execute({ de: '558586467241@c.us', texto: 'oi' });

      expect(params().system).toContain('Não use a ferramenta registrar_relato');
    });

    it('chama a vendedora pelo primeiro nome', async () => {
      await useCase.execute({ de: '558586467241@c.us', texto: 'oi' });

      expect(params().system).toContain('falando com Marina');
    });
  });

  // WhatsApp nao renderiza grafico; oferecer a ferramenta so convida o modelo
  // a tentar e depois se desculpar.
  it('nao oferece grafico no canal de WhatsApp', async () => {
    await useCase.execute({ de: '558586467241@c.us', texto: 'oi' });

    expect(params().graficos).toBe(false);
  });


  /**
   * AUDIO — acrescentado em 21/08/2026.
   *
   * O QUE ESTES TESTES PROTEGEM e a ORDEM. Transcrever e chamada PAGA; se ela
   * acontecesse antes do default-deny, qualquer pessoa mandando audio para o
   * numero queimaria credito da OpenAI. O primeiro teste e o que fecha isso, e
   * ele falha no dia em que alguem mover a transcricao para a borda HTTP
   * "porque fica mais limpo".
   */
  describe('audio', () => {
    const AUDIO = {
      url: 'http://waha:3000/api/files/default/abc.oga',
      mimetype: 'audio/ogg; codecs=opus',
      segundos: 5,
    };

    it('audio de quem NAO e vendedora nao baixa nem transcreve — custo zero', async () => {
      identificar.execute.mockResolvedValue(null);

      const r = await useCase.execute({ de: '5585999999999@c.us', texto: '', audio: AUDIO });

      expect(r.resposta).toBeNull();
      expect(r.motivo).toBe('ignorado_remetente_desconhecido');
      expect(whatsapp.baixarMidia).not.toHaveBeenCalled();
      expect(transcricao.transcrever).not.toHaveBeenCalled();
      expect(llm.chatComFerramentas).not.toHaveBeenCalled();
    });

    it('audio da vendedora vira texto e segue como mensagem digitada', async () => {
      whatsapp.baixarMidia.mockResolvedValue({
        conteudo: Buffer.from('ogg'),
        mimetype: 'audio/ogg',
      });
      transcricao.transcrever.mockResolvedValue('quais são meus clientes de hoje?');

      await useCase.execute({ de: '558586467241@c.us', texto: '', audio: AUDIO });

      expect(whatsapp.baixarMidia).toHaveBeenCalledWith(AUDIO.url);
      // O agente recebe o TEXTO; daqui para baixo ninguem sabe que houve audio.
      expect(params().mensagens[0].content).toContain('quais são meus clientes de hoje?');
    });

    it('audio longo demais e recusado ANTES de baixar', async () => {
      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: '',
        audio: { ...AUDIO, segundos: 600 },
      });

      expect(whatsapp.baixarMidia).not.toHaveBeenCalled();
      expect(r.motivo).toBe('audio_nao_entendido');
    });

    it('transcricao falhou: avisa em vez de ficar mudo', async () => {
      whatsapp.baixarMidia.mockResolvedValue({
        conteudo: Buffer.from('ogg'),
        mimetype: 'audio/ogg',
      });
      transcricao.transcrever.mockResolvedValue(null);

      const r = await useCase.execute({ de: '558586467241@c.us', texto: '', audio: AUDIO });

      expect(r.motivo).toBe('audio_nao_entendido');
      expect(r.resposta).toContain('escrito');
      expect(llm.chatComFerramentas).not.toHaveBeenCalled();
    });

    it('texto digitado tem precedencia — nao transcreve a toa', async () => {
      await useCase.execute({ de: '558586467241@c.us', texto: 'oi', audio: AUDIO });

      expect(transcricao.transcrever).not.toHaveBeenCalled();
    });
  });
  it('falha do agente vira desculpa, nao silencio nem stack', async () => {
    llm.chatComFerramentas.mockRejectedValue(new Error('timeout'));

    const r = await useCase.execute({ de: '558586467241@c.us', texto: 'oi' });

    expect(r.motivo).toBe('falha_agente');
    expect(r.resposta).toContain('de novo');
  });
});
