import { Logger } from '@nestjs/common';
import { AnthropicClient } from './anthropic.client';
import type { ChatParams } from '../../domain/ports/llm-client.port';

/**
 * DUAS FALHAS DIFERENTES DIZIAM A MESMA COISA — 30/09/2026.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE, E POR QUE ELE EXISTE.
 *
 * Em 22/09 um `$` sumiu de um parametro SQL e derrubou
 * `feedbacks_de_vendedora`. Toda pergunta de feedback caia no catch de
 * `executarLeitura`, e a agente respondia "tente de novo em instantes" — a
 * MESMA frase de um WAHA fora do ar.
 *
 * Ficou OITO DIAS assim. Ninguem reclamou porque ninguem tem como saber que
 * aquilo nunca ia voltar, e o log dizia "Falha na ferramenta" como diria para
 * um timeout.
 *
 * O canal do WhatsApp nao tem quem abra chamado. Se a distincao nao estiver
 * aqui, ela nao existe em lugar nenhum.
 * ==========================================================================
 */
describe('o erro de ferramenta, quando e defeito e quando e passageiro', () => {
  let cliente: AnthropicClient;
  let create: jest.Mock;
  let erroLogado: jest.SpyInstance;

  const pede = (nome: string) => ({
    content: [{ type: 'tool_use', id: 'tu-1', name: nome, input: {} }],
    usage: { output_tokens: 10 },
    stop_reason: 'tool_use',
  });

  const responde = (texto: string) => ({
    content: [{ type: 'text', text: texto }],
    usage: { output_tokens: 5 },
    stop_reason: 'end_turn',
  });

  const base = (handler: jest.Mock): ChatParams =>
    ({
      model: 'claude-sonnet-5',
      maxTokens: 2048,
      system: 'voce e a Anastasia',
      mensagens: [{ role: 'user', content: 'como foi o feedback da Marina?' }],
      gestaoLeads: handler,
    }) as unknown as ChatParams;

  /** O que o modelo recebeu de volta da ferramenta, na segunda chamada. */
  const conteudoDoToolResult = (): string => {
    const msgs = create.mock.calls[1][0].messages as Array<{
      role: string;
      content: unknown;
    }>;
    const ultima = msgs[msgs.length - 1];
    const blocos = ultima.content as Array<{
      type: string;
      content?: string;
    }>;
    return blocos.find((b) => b.type === 'tool_result')?.content ?? '';
  };

  const rodarCom = async (erro: unknown) => {
    const handler = jest.fn().mockRejectedValue(erro);
    create
      .mockResolvedValueOnce(pede('listar_leads'))
      .mockResolvedValueOnce(responde('Entendi.'));
    await cliente.chatComFerramentas(base(handler));
  };

  beforeEach(() => {
    cliente = new AnthropicClient({ get: () => 'chave-de-teste' } as never);
    create = jest.fn();
    (cliente as unknown as { client: unknown }).client = {
      messages: { create },
    };
    erroLogado = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => erroLogado.mockRestore());

  describe('defeito de codigo — tentar de novo NAO resolve', () => {
    /** Um erro do TypeORM, como o `$` ausente produzia. */
    const erroDeSql = () => {
      const e = new Error(
        'operator does not exist: timestamp with time zone >= integer',
      );
      e.name = 'QueryFailedError';
      return e;
    };

    it('a agente é mandada NÃO oferecer tentar de novo', async () => {
      await rodarCom(erroDeSql());
      const conteudo = conteudoDoToolResult();

      expect(conteudo).toContain('defeito');
      expect(conteudo).toContain('NAO ofereca tentar de novo');
      // O ponto do arquivo: a frase do passageiro NAO pode aparecer aqui.
      expect(conteudo).not.toContain('tentar de novo em instantes');
    });

    it('o log grita DEFEITO, e não "falha"', async () => {
      await rodarCom(erroDeSql());
      const linhas = erroLogado.mock.calls.map((c) => String(c[0]));

      expect(linhas.some((l) => l.includes('DEFEITO NA FERRAMENTA'))).toBe(true);
      expect(linhas.some((l) => l.includes('QueryFailedError'))).toBe(true);
    });

    it('TypeError também é defeito', async () => {
      await rodarCom(new TypeError("Cannot read properties of undefined"));

      expect(conteudoDoToolResult()).toContain('defeito');
    });

    /* ================================================================
     * A GUARDA DE PII, e e a mais importante daqui.
     *
     * O `QueryFailedError` do TypeORM carrega `query` e `parameters` em
     * propriedades proprias — e os parametros sao hash de telefone e nome de
     * cliente. Logar o erro inteiro (`String(err)`) vazaria os dois.
     * ================================================================ */
    it('o log NÃO leva os parâmetros da consulta', async () => {
      const e = new Error('operator does not exist');
      e.name = 'QueryFailedError';
      Object.assign(e, {
        query: 'SELECT * FROM clientes WHERE telefone_hash = $1',
        parameters: ['hash-de-telefone-nao-pode-vazar', 'Marina Silva'],
      });

      await rodarCom(e);
      const tudo = erroLogado.mock.calls.map((c) => String(c[0])).join('\n');

      expect(tudo).not.toContain('hash-de-telefone-nao-pode-vazar');
      expect(tudo).not.toContain('Marina Silva');
      expect(tudo).not.toContain('telefone_hash');
      // Mas a mensagem do driver, que é o que serve para consertar, entra.
      expect(tudo).toContain('operator does not exist');
    });
  });

  describe('falha passageira — tentar de novo resolve', () => {
    it('rede fora do ar mantém o convite a tentar de novo', async () => {
      await rodarCom(new Error('connect ECONNREFUSED 127.0.0.1:3000'));
      const conteudo = conteudoDoToolResult();

      expect(conteudo).toContain('tentar de novo em instantes');
      expect(conteudo).not.toContain('defeito');
    });

    it('o log continua dizendo "Falha", sem alarme falso', async () => {
      await rodarCom(new Error('timeout'));
      const linhas = erroLogado.mock.calls.map((c) => String(c[0]));

      expect(linhas.some((l) => l.includes('Falha na ferramenta'))).toBe(true);
      expect(linhas.some((l) => l.includes('DEFEITO'))).toBe(false);
    });

    it('o que não é Error nenhum cai no lado seguro — passageiro', async () => {
      await rodarCom('alguma coisa jogada sem ser Error');

      expect(conteudoDoToolResult()).toContain('tentar de novo em instantes');
    });
  });

  it('a conversa NÃO é derrubada: o turno segue e responde', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('qualquer coisa'));
    create
      .mockResolvedValueOnce(pede('listar_leads'))
      .mockResolvedValueOnce(responde('Não consegui essa, mas posso ver outra.'));

    const r = await cliente.chatComFerramentas(base(handler));

    expect(r.texto).toBe('Não consegui essa, mas posso ver outra.');
  });
});
