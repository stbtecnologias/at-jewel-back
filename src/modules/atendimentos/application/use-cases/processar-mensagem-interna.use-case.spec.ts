import { ConfigService } from '@nestjs/config';
import type { ChatParams } from '../../../agentes/domain/ports/llm-client.port';
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
  const VENDEDORA = { id: 'vd-1', nome: 'Marina Albuquerque', ativo: true };

  let identificar: { execute: jest.Mock };
  let relato: { execute: jest.Mock };
  let agenda: { execute: jest.Mock };
  let desempenho: { vendas: jest.Mock; metas: jest.Mock };
  let atendimentos: { buscarCobrancaAguardando: jest.Mock };
  let clientes: { buscarPorId: jest.Mock };
  let llm: { chatComFerramentas: jest.Mock; chat: jest.Mock };
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
    atendimentos = { buscarCobrancaAguardando: jest.fn().mockResolvedValue(null) };
    clientes = { buscarPorId: jest.fn().mockResolvedValue({ nome: 'Helena Gomes' }) };
    llm = {
      chatComFerramentas: jest.fn().mockResolvedValue({ texto: 'ok', tokens: 1 }),
      chat: jest.fn(),
    };

    useCase = new ProcessarMensagemInternaUseCase(
      identificar as never,
      relato as never,
      agenda as never,
      desempenho as never,
      atendimentos as never,
      clientes as never,
      llm as never,
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

  it('falha do agente vira desculpa, nao silencio nem stack', async () => {
    llm.chatComFerramentas.mockRejectedValue(new Error('timeout'));

    const r = await useCase.execute({ de: '558586467241@c.us', texto: 'oi' });

    expect(r.motivo).toBe('falha_agente');
    expect(r.resposta).toContain('de novo');
  });
});
