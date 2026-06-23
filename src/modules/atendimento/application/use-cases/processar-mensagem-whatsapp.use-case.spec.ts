import { ConfigService } from '@nestjs/config';
import type { ILlmClient } from '../../../agentes/domain/ports/llm-client.port';
import type { IAgentePromptsRepository } from '../../../agentes/domain/ports/repositories/agente-prompts-repository.port';
import type { IWhatsappGateway } from '../../domain/ports/whatsapp-gateway.port';
import { ProcessarMensagemWhatsappUseCase } from './processar-mensagem-whatsapp.use-case';

function make() {
  const llm: jest.Mocked<ILlmClient> = {
    chat: jest.fn().mockResolvedValue({ texto: 'Olá, seja bem-vinda à A.T. Jewel.', tokens: 10 }),
    chatComGrafico: jest.fn(),
  } as unknown as jest.Mocked<ILlmClient>;

  const whatsapp: jest.Mocked<IWhatsappGateway> = {
    enviarTexto: jest.fn().mockResolvedValue(undefined),
  };

  const config = {
    get: jest.fn().mockReturnValue('claude-opus-4-8'),
  } as unknown as ConfigService;

  // Sem override no DB -> usa a persona padrao (fallback).
  const prompts: jest.Mocked<IAgentePromptsRepository> = {
    buscar: jest.fn().mockResolvedValue(null),
    buscarTodos: jest.fn(),
    salvar: jest.fn(),
  } as unknown as jest.Mocked<IAgentePromptsRepository>;

  const useCase = new ProcessarMensagemWhatsappUseCase(llm, whatsapp, config, prompts);
  return { useCase, llm, whatsapp, prompts };
}

describe('ProcessarMensagemWhatsappUseCase', () => {
  it('gera resposta com o LLM e envia pelo gateway', async () => {
    const { useCase, llm, whatsapp } = make();

    const r = await useCase.execute({ de: '5585999@c.us', texto: 'Oi, quero um anel' });

    expect(r).toEqual({ resposta: 'Olá, seja bem-vinda à A.T. Jewel.', enviada: true });
    expect(llm.chat).toHaveBeenCalledTimes(1);
    expect(whatsapp.enviarTexto).toHaveBeenCalledWith(
      '5585999@c.us',
      'Olá, seja bem-vinda à A.T. Jewel.',
    );
  });

  it('usa a persona de triagem da Anastasia no system prompt', async () => {
    const { useCase, llm } = make();

    await useCase.execute({ de: '5585999@c.us', texto: 'Oi' });

    const arg = llm.chat.mock.calls[0][0];
    expect(arg.system).toContain('Anastasia');
    expect(arg.system).toContain('triagem');
    // Regra dura: nunca informar preco — garante que e a persona certa.
    expect(arg.system).toMatch(/NUNCA informe pre/i);
  });

  it('ignora mensagem vazia (so espacos) sem chamar LLM nem gateway', async () => {
    const { useCase, llm, whatsapp } = make();

    const r = await useCase.execute({ de: '5585999@c.us', texto: '   ' });

    expect(r).toBeNull();
    expect(llm.chat).not.toHaveBeenCalled();
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  it('preserva a resposta mesmo se o envio falhar (enviada=false)', async () => {
    const { useCase, whatsapp } = make();
    whatsapp.enviarTexto.mockRejectedValueOnce(new Error('sessao WAHA nao conectada'));

    const r = await useCase.execute({ de: '5585999@c.us', texto: 'Oi' });

    expect(r).toEqual({
      resposta: 'Olá, seja bem-vinda à A.T. Jewel.',
      enviada: false,
    });
  });

  it('higieniza e apara o texto da cliente antes de enviar ao LLM', async () => {
    const { useCase, llm } = make();

    // Zero-width space (U+200B) embutido + espacos nas bordas.
    await useCase.execute({ de: '5585999@c.us', texto: '  Oi​ quero ver  ' });

    const conteudo = llm.chat.mock.calls[0][0].mensagens[0].content;
    expect(conteudo).not.toContain('​'); // invisivel removido
    expect(conteudo).toBe(conteudo.trim()); // bordas aparadas
  });
});
