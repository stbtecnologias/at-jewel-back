import { ConfigService } from '@nestjs/config';
import type { CriarDemandaUseCase } from '../../../demandas/application/use-cases/criar-demanda.use-case';
import type { MensagemAgente } from '../../domain/entities/conversa.entity';
import type { ChatParams, ILlmClient } from '../../domain/ports/llm-client.port';
import type { IAgentePromptsRepository } from '../../domain/ports/repositories/agente-prompts-repository.port';
import { ChatAnastasiaUseCase } from './chat-anastasia.use-case';
import { AvisarVendedoraUseCase } from './avisar-vendedora.use-case';

function makeLlmMock(): jest.Mocked<ILlmClient> {
  return {
    chat: jest.fn(),
    chatComFerramentas: jest.fn().mockResolvedValue({ texto: 'ok', tokens: 1 }),
  } as unknown as jest.Mocked<ILlmClient>;
}

function makePromptsMock(): jest.Mocked<IAgentePromptsRepository> {
  return {
    buscar: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<IAgentePromptsRepository>;
}

function makeCriarDemandaMock(): jest.Mocked<CriarDemandaUseCase> {
  return {
    execute: jest.fn(),
  } as unknown as jest.Mocked<CriarDemandaUseCase>;
}

const config = new ConfigService({});
const mensagens: MensagemAgente[] = [{ role: 'user', content: 'oi' }];

describe('ChatAnastasiaUseCase (tool registrar_demanda)', () => {
  let llm: jest.Mocked<ILlmClient>;
  let prompts: jest.Mocked<IAgentePromptsRepository>;
  let criarDemanda: jest.Mocked<CriarDemandaUseCase>;
  let avisarVendedora: jest.Mocked<AvisarVendedoraUseCase>;
  let ferramentasGestao: { montar: jest.Mock };
  let permissoes: { possui: jest.Mock };
  let useCase: ChatAnastasiaUseCase;

  beforeEach(() => {
    llm = makeLlmMock();
    prompts = makePromptsMock();
    criarDemanda = makeCriarDemandaMock();
    avisarVendedora = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AvisarVendedoraUseCase>;
    // Sem papel nos testes existentes: sem `role` no solicitante, as
    // ferramentas de gestao nao entram, e o comportamento antigo fica igual.
    ferramentasGestao = { montar: jest.fn(() => ({})) };
    permissoes = { possui: jest.fn(async () => false) };

    useCase = new ChatAnastasiaUseCase(
      llm,
      config,
      prompts,
      criarDemanda,
      avisarVendedora,
      ferramentasGestao as never,
      permissoes as never,
    );
  });

  it('nao habilita a tool quando nao ha solicitante identificado', async () => {
    await useCase.execute(mensagens, undefined, undefined);

    const params = llm.chatComFerramentas.mock.calls[0][0] as ChatParams;
    expect(params.registrarDemanda).toBeUndefined();
  });

  it('habilita a tool e o handler cria demanda com canal ASSISTENTE', async () => {
    criarDemanda.execute.mockResolvedValue({ id: 'abcdef12-3456' } as any);

    await useCase.execute(mensagens, undefined, {
      userId: 'user-1',
      nomeFallback: 'ana@atjewel.com',
    });

    const params = llm.chatComFerramentas.mock.calls[0][0] as ChatParams;
    expect(params.registrarDemanda).toBeDefined();

    // Simula o dispatch da tool pelo cliente LLM.
    const resultado = await params.registrarDemanda!({
      tipo: 'RELATORIO',
      descricao: 'relatorio de giro por familia',
    });

    expect(criarDemanda.execute).toHaveBeenCalledWith({
      tipo: 'RELATORIO',
      descricao: 'relatorio de giro por familia',
      canal: 'ASSISTENTE',
      solicitanteUserId: 'user-1',
      solicitanteNomeFallback: 'ana@atjewel.com',
    });
    expect(resultado).toEqual({ id: 'abcdef12-3456' });
  });

  /**
   * AS FERRAMENTAS DA GESTAO NO PAINEL — 21/08.
   *
   * Ate aqui, a mesma pessoa recebia respostas diferentes conforme a porta:
   * pelo WhatsApp a Anastasia consultava agenda e desempenho de qualquer
   * vendedora, e no painel nao sabia nada disso.
   *
   * O que estes testes protegem e o CRITERIO SER UM SO. Se alguem trocar a
   * permissao aqui por outra chave, ou por um papel fixo, as duas portas
   * voltam a divergir — e a divergencia so aparece quando alguem reclama.
   */
  describe('ferramentas de gestao', () => {
    it('sem papel no solicitante, nao entram', async () => {
      await useCase.execute([{ role: 'user', content: 'oi' }], undefined, {
        userId: 'user-1',
        nomeFallback: 'ana@atjewel.com',
      });

      expect(permissoes.possui).not.toHaveBeenCalled();
      expect(ferramentasGestao.montar).not.toHaveBeenCalled();
    });

    it('papel SEM vendas:read_all nao recebe as ferramentas', async () => {
      permissoes.possui.mockResolvedValue(false);

      await useCase.execute([{ role: 'user', content: 'oi' }], undefined, {
        userId: 'user-1',
        nomeFallback: 'ana@atjewel.com',
        role: 'VENDEDORA',
      });

      expect(permissoes.possui).toHaveBeenCalledWith('VENDEDORA', 'vendas:read_all');
      expect(ferramentasGestao.montar).not.toHaveBeenCalled();
    });

    it('papel COM vendas:read_all recebe — a mesma chave do WhatsApp', async () => {
      permissoes.possui.mockResolvedValue(true);
      ferramentasGestao.montar.mockReturnValue({ gestaoAgenda: jest.fn() });

      await useCase.execute([{ role: 'user', content: 'agenda da Marina?' }], undefined, {
        userId: 'user-1',
        nomeFallback: 'ana@atjewel.com',
        role: 'ADMIN',
      });

      expect(permissoes.possui).toHaveBeenCalledWith('ADMIN', 'vendas:read_all');
      expect(ferramentasGestao.montar).toHaveBeenCalled();
      const params = (llm.chatComFerramentas as jest.Mock).mock.calls[0][0];
      expect(params.gestaoAgenda).toBeDefined();
    });

    it('o grafico CONTINUA ligado no painel — a diferenca que deve existir', async () => {
      permissoes.possui.mockResolvedValue(true);

      await useCase.execute([{ role: 'user', content: 'oi' }], undefined, {
        userId: 'user-1',
        nomeFallback: 'ana@atjewel.com',
        role: 'ADMIN',
      });

      const params = (llm.chatComFerramentas as jest.Mock).mock.calls[0][0];
      // O WhatsApp passa `graficos: false`; aqui nao passa nada, e o default
      // do cliente e ligado. A tela renderiza, a conversa nao.
      expect(params.graficos).toBeUndefined();
    });
  });
});
