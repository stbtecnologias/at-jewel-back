import { AnthropicClient } from './anthropic.client';
import type { ChatParams } from '../../domain/ports/llm-client.port';

/**
 * O LACO DE FERRAMENTAS DAVA UMA VOLTA SO — 29/09/2026.
 *
 * ==========================================================================
 * O DEFEITO NAO APARECIA EM LUGAR NENHUM, E ESSA E A PARTE IMPORTANTE.
 *
 * O cliente pedia as ferramentas, rodava, perguntava de novo e devolvia o
 * texto. Se a SEGUNDA resposta tambem pedisse ferramentas — que e o que o
 * modelo faz numa pergunta encadeada — esses pedidos eram jogados fora sem
 * um log, porque `extrairTexto` le so o bloco de texto e ignora o resto.
 *
 * O Lucas viu assim:
 *
 *   "Como esta a agenda da Aline hoje?"  -> respondeu certo
 *   "e das outras vendedoras?"           -> "Vou olhar a agenda de hoje das
 *                                           outras sete."  e mais nada
 *
 * O modelo tinha pedido as outras seis agendas junto daquela frase. Ninguem
 * rodou, e o turno morreu no anuncio. Parece travamento e e desenho.
 *
 * O SINTOMA ENGANA: pergunta simples sempre funciona. Entao o defeito se
 * disfarca de instabilidade — "as vezes ela responde, as vezes nao" — e
 * nenhum teste de ferramenta pega, porque cada ferramenta, sozinha, funciona.
 * ==========================================================================
 */
describe('o laço de ferramentas', () => {
  let cliente: AnthropicClient;
  let create: jest.Mock;

  /** Uma resposta do modelo que PEDE uma ferramenta. */
  const pede = (nome: string, id = `tu-${nome}`) => ({
    content: [
      { type: 'text', text: 'Vou olhar.' },
      { type: 'tool_use', id, name: nome, input: {} },
    ],
    usage: { output_tokens: 10 },
    stop_reason: 'tool_use',
  });

  /** Uma resposta do modelo que RESPONDE. */
  const responde = (texto: string) => ({
    content: [{ type: 'text', text: texto }],
    usage: { output_tokens: 5 },
    stop_reason: 'end_turn',
  });

  const base = (): ChatParams =>
    ({
      model: 'claude-sonnet-5',
      maxTokens: 2048,
      system: 'voce e a Anastasia',
      mensagens: [{ role: 'user', content: 'e das outras vendedoras?' }],
      gestaoLeads: jest.fn().mockResolvedValue({ linhas: ['lead 1'] }),
    }) as unknown as ChatParams;

  beforeEach(() => {
    cliente = new AnthropicClient({
      get: () => 'chave-de-teste',
    } as never);
    create = jest.fn();
    // O SDK e construido dentro do proprio cliente; trocamos a porta de saida.
    (cliente as unknown as { client: unknown }).client = {
      messages: { create },
    };
  });

  /* ESTE E O TESTE. O resto e contorno. */
  it('a ferramenta pedida na SEGUNDA volta também roda', async () => {
    const leads = jest.fn().mockResolvedValue({ linhas: ['lead 1'] });
    create
      .mockResolvedValueOnce(pede('listar_leads', 'a'))
      .mockResolvedValueOnce(pede('listar_leads', 'b'))
      .mockResolvedValueOnce(responde('Aqui estão as duas.'));

    const r = await cliente.chatComFerramentas({
      ...base(),
      gestaoLeads: leads,
    });

    expect(leads).toHaveBeenCalledTimes(2);
    expect(r.texto).toBe('Aqui estão as duas.');
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('sem pedido nenhum, responde na primeira e não gasta volta', async () => {
    create.mockResolvedValueOnce(responde('Bom dia, Lucas!'));

    const r = await cliente.chatComFerramentas(base());

    expect(r.texto).toBe('Bom dia, Lucas!');
    expect(create).toHaveBeenCalledTimes(1);
  });

  /*
   * O teto nao pode reintroduzir o defeito: quando ele bate, o turno TEM de
   * terminar em texto. `tool_choice: none` e o que obriga isso — sem ele, a
   * ultima resposta viria pedindo ferramenta de novo e o texto sumiria.
   */
  describe('quando o modelo não para de pedir', () => {
    beforeEach(() => {
      create.mockImplementation((req: { tool_choice?: { type: string } }) =>
        Promise.resolve(
          req.tool_choice?.type === 'none'
            ? responde('Consegui só parte, me diga se busco o resto.')
            : pede('listar_leads'),
        ),
      );
    });

    it('para no teto e ainda assim devolve texto', async () => {
      const r = await cliente.chatComFerramentas(base());

      expect(r.texto).toBe('Consegui só parte, me diga se busco o resto.');
      // 5 voltas de ferramenta + a chamada que fecha o turno.
      expect(create).toHaveBeenCalledTimes(6);
    });

    it('e a última chamada proíbe ferramenta, em vez de descartar o pedido', async () => {
      await cliente.chatComFerramentas(base());

      const ultima = create.mock.calls.at(-1)![0];
      expect(ultima.tool_choice).toEqual({ type: 'none' });
      // As ferramentas continuam DECLARADAS: a conversa ja tem `tool_result`
      // dentro, e tira-las confundiria a API.
      expect(ultima.tools.length).toBeGreaterThan(0);
    });
  });

  /*
   * A trava existe contra criacao em massa, inclusive por injecao no texto de
   * um cliente. Se ela nascesse a cada volta, o laco de cinco voltas daria
   * cinco demandas — o laco teria transformado a protecao em enfeite.
   */
  it('a trava de escrita atravessa as voltas: uma demanda por turno', async () => {
    const registrar = jest.fn().mockResolvedValue({ id: 'd-1' });
    create
      .mockResolvedValueOnce(pede('registrar_demanda', 'a'))
      .mockResolvedValueOnce(pede('registrar_demanda', 'b'))
      .mockResolvedValueOnce(responde('Registrei uma.'));

    await cliente.chatComFerramentas({
      ...base(),
      registrarDemanda: registrar,
    } as unknown as ChatParams);

    expect(registrar).toHaveBeenCalledTimes(1);

    // E o segundo pedido volta ao modelo como recusa explicita, para ele
    // dizer isso — e nao sumir calado, que era o defeito irmao.
    const segunda = create.mock.calls[2][0];
    const recusa = segunda.messages.at(-1).content[0];
    expect(recusa.is_error).toBe(true);
    expect(recusa.content).toContain('apenas uma demanda');
  });

  /*
   * A continuacao tinha `max_tokens: 1024` fixo, ignorando quem chamou — e a
   * continuacao E a resposta de verdade. Quem pedia 2048 tinha a resposta
   * cortada pela metade, com `stop_reason: max_tokens`, sem aviso.
   */
  it('a continuação respeita o teto de tokens de quem chamou', async () => {
    create
      .mockResolvedValueOnce(pede('listar_leads'))
      .mockResolvedValueOnce(responde('pronto'));

    await cliente.chatComFerramentas({ ...base(), maxTokens: 2048 });

    expect(create.mock.calls[1][0].max_tokens).toBe(2048);
  });

  it('mas nunca abaixo de 1024, que era o valor historico', async () => {
    create
      .mockResolvedValueOnce(pede('listar_leads'))
      .mockResolvedValueOnce(responde('pronto'));

    await cliente.chatComFerramentas({ ...base(), maxTokens: 300 });

    expect(create.mock.calls[1][0].max_tokens).toBe(1024);
  });

  it('os tokens de TODAS as voltas entram na conta', async () => {
    create
      .mockResolvedValueOnce(pede('listar_leads', 'a'))
      .mockResolvedValueOnce(pede('listar_leads', 'b'))
      .mockResolvedValueOnce(responde('pronto'));

    const r = await cliente.chatComFerramentas(base());

    expect(r.tokens).toBe(10 + 10 + 5);
  });
});
