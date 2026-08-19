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
    chatComGrafico: jest.fn().mockResolvedValue({ texto: 'ok', tokens: 1 }),
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
  let useCase: ChatAnastasiaUseCase;

  beforeEach(() => {
    llm = makeLlmMock();
    prompts = makePromptsMock();
    criarDemanda = makeCriarDemandaMock();
    avisarVendedora = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AvisarVendedoraUseCase>;
    useCase = new ChatAnastasiaUseCase(
      llm,
      config,
      prompts,
      criarDemanda,
      avisarVendedora,
    );
  });

  it('nao habilita a tool quando nao ha solicitante identificado', async () => {
    await useCase.execute(mensagens, undefined, undefined);

    const params = llm.chatComGrafico.mock.calls[0][0] as ChatParams;
    expect(params.registrarDemanda).toBeUndefined();
  });

  it('habilita a tool e o handler cria demanda com canal ASSISTENTE', async () => {
    criarDemanda.execute.mockResolvedValue({ id: 'abcdef12-3456' } as any);

    await useCase.execute(mensagens, undefined, {
      userId: 'user-1',
      nomeFallback: 'ana@atjewel.com',
    });

    const params = llm.chatComGrafico.mock.calls[0][0] as ChatParams;
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
});
