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

  // ========================================================================
  // A RESPOSTA EM DOIS BLOCOS, E A PROMESSA QUE NAO VIRA DADO — 26/10/2026.
  //
  // Em producao chegaram duas meias respostas, e as duas ele teve de cobrar
  // com um "cade?":
  //
  //   "Vou olhar o faturamento por empresa deste ano."   (e parou)
  //   "Faturamento por empresa em 2026:"                 (e parou)
  // ========================================================================
  describe('a meia resposta', () => {
    const emDoisBlocos = (a: string, b: string) => ({
      content: [
        { type: 'text', text: a },
        { type: 'text', text: b },
      ],
      usage: { output_tokens: 20 },
      stop_reason: 'end_turn',
    });

    /* Era `.find()`: so o primeiro bloco saia, e a lista ficava para tras. */
    it('os dois blocos de texto vao juntos, e nao so o primeiro', async () => {
      create.mockResolvedValueOnce(
        emDoisBlocos(
          'Faturamento por empresa em 2026:',
          '1. AT JEWEL LTDA — R$ 15.714.173',
        ),
      );

      const r = await cliente.chatComFerramentas(base());

      expect(r.texto).toContain('Faturamento por empresa em 2026:');
      expect(r.texto).toContain('AT JEWEL LTDA');
    });

    /* A PROMESSA E COBRADA, e a segunda chamada ja pode pedir ferramenta. */
    it('promessa sem consulta ganha mais uma rodada, e o dado sai', async () => {
      create
        .mockResolvedValueOnce(
          responde('Vou olhar o faturamento por empresa deste ano.'),
        )
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'tu-leads',
              name: 'listar_leads',
              input: {},
            },
          ],
          usage: { output_tokens: 10 },
          stop_reason: 'tool_use',
        })
        .mockResolvedValueOnce(responde('Tem um lead na fila: lead 1.'));

      const r = await cliente.chatComFerramentas(base());

      expect(create).toHaveBeenCalledTimes(3);
      expect(r.texto).toContain('lead 1');
    });

    /* UMA VEZ SO: se ele insistir na promessa, a frase sai — cobrar em laco
     * trocaria uma resposta ruim por uma conversa travada. */
    it('a cobranca acontece uma vez so', async () => {
      create
        .mockResolvedValueOnce(responde('Vou buscar os leads.'))
        .mockResolvedValueOnce(responde('Vou buscar os leads agora.'));

      const r = await cliente.chatComFerramentas(base());

      expect(create).toHaveBeenCalledTimes(2);
      expect(r.texto).toBe('Vou buscar os leads agora.');
    });

    /* PERGUNTA NAO E PROMESSA: a agente pedindo o recorte esta certa, e
     * cobrar dado aqui atropelaria a unica resposta correta. */
    it('pergunta de esclarecimento nao e cobrada', async () => {
      create.mockResolvedValueOnce(
        responde('Voce quer o faturamento da filial ou as vendas uma a uma?'),
      );

      await cliente.chatComFerramentas(base());

      expect(create).toHaveBeenCalledTimes(1);
    });
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

  /**
   * ========================================================================
   * ANTES DE PEDIR QUE ELA REPITA, TENTE DE NOVO — 21/10/2026.
   *
   * "Me perdi no meio da resposta. Pode repetir a pergunta?" foi o que o
   * Lucas recebeu as 14:57 depois de "gera o pdf" — e a pergunta estava na
   * conversa que eu acabei de mandar ao modelo. Mandar a pessoa digitar de
   * novo o que ja esta em maos e cobrar dela a minha falha.
   *
   * Pedido dele, no mesmo dia: *"so nao quero que o cliente fique falando a
   * mesma coisa, principalmente quando esta dentro do mesmo assunto e em
   * poucos minutos"*.
   * ========================================================================
   */
  describe('o turno que voltou sem texto', () => {
    /** O modelo encerrou sem escrever nada. */
    const mudo = (stop = 'end_turn') => ({
      content: [],
      usage: { output_tokens: 0 },
      stop_reason: stop,
    });

    /* ESTE E O TESTE. */
    it('tenta mais uma vez, em vez de pedir que ela repita', async () => {
      create
        .mockResolvedValueOnce(mudo())
        .mockResolvedValueOnce(responde('A Camila fez 2 vendas.'));

      const r = await cliente.chatComFerramentas(base());

      expect(r.texto).toBe('A Camila fez 2 vendas.');
      expect(r.semTexto).toBeUndefined();
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('e a segunda chamada OBRIGA texto — o que faltou foi escrever', async () => {
      create
        .mockResolvedValueOnce(mudo())
        .mockResolvedValueOnce(responde('Pronto.'));

      await cliente.chatComFerramentas(base());

      expect(create.mock.calls[1][0].tool_choice).toEqual({ type: 'none' });
      // E a conversa mandada e a MESMA: a pergunta dela nao se perde.
      expect(create.mock.calls[1][0].messages).toEqual(
        create.mock.calls[0][0].messages,
      );
    });

    it('tenta UMA vez só — calado duas vezes, aí sim a frase', async () => {
      create.mockResolvedValue(mudo());

      const r = await cliente.chatComFerramentas(base());

      expect(r.texto).toBe('');
      expect(r.semTexto).toBe('outro');
      expect(create).toHaveBeenCalledTimes(2);
    });

    // ======================================================================
    // E NAO INSISTE QUANDO O SILENCIO TEM CAUSA.
    //
    // Cortada por tamanho, repetir da o mesmo corte e cobra de novo. Recusa,
    // idem. Nesses dois a frase certa e a que diz o que fazer.
    // ======================================================================
    it.each([['max_tokens'], ['refusal']])(
      'nao repete quando o motivo foi %s',
      async (motivo) => {
        create.mockResolvedValueOnce(mudo(motivo));

        const r = await cliente.chatComFerramentas(base());

        expect(r.semTexto).toBe(motivo);
        expect(create).toHaveBeenCalledTimes(1);
      },
    );

    it('depois de uma ferramenta, a segunda chance ainda vale', async () => {
      const leads = jest.fn().mockResolvedValue({ linhas: ['lead 1'] });
      create
        .mockResolvedValueOnce(pede('listar_leads'))
        .mockResolvedValueOnce(mudo())
        .mockResolvedValueOnce(responde('Tem um lead na fila.'));

      const r = await cliente.chatComFerramentas({
        ...base(),
        gestaoLeads: leads,
      });

      expect(r.texto).toBe('Tem um lead na fila.');
      // A consulta NAO roda de novo: o que faltou foi escrever, nao consultar.
      expect(leads).toHaveBeenCalledTimes(1);
    });
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

  /*
   * A SEGUNDA VEZ QUE UM VAZIO DERRUBOU A CONVERSA — 30/09/2026.
   *
   * Em 29/09 foi um `tool_result`; hoje foi o turno do usuario, quando
   * alguem mencionou a agente num grupo sem escrever mais nada. Mesmo 400,
   * mesma resposta inutil ("nao consegui consultar isso agora"), e o erro em
   * nenhum dos dois casos diz de onde veio o vazio.
   */
  it('turno vazio não sai daqui vazio', async () => {
    create.mockResolvedValueOnce(responde('oi'));

    await cliente.chatComFerramentas({
      ...base(),
      mensagens: [{ role: 'user', content: '   ' }],
    } as unknown as ChatParams);

    expect(create.mock.calls[0][0].messages[0].content).toBe(
      '(mensagem sem texto)',
    );
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

/**
 * ==========================================================================
 * A FOTO QUE A AGENTE ANUNCIOU E NUNCA CHEGOU — 07/10/2026.
 *
 * Pelo WhatsApp:
 *
 *   "me mostra o AN22083"
 *   "Anel solitário diamantes 0.30 cts, ouro branco 18K — código AN22083:
 *    R$ 8.900, disponível. Segue a foto."
 *
 * E a foto não veio. O handler tinha baixado a imagem (78 KB, conferido
 * contra a Conexa), o texto do despacho já mandava anunciá-la — mas o
 * cliente do LLM largava a lista no caminho, e o webhook recebia vazio.
 *
 * A SUÍTE INTEIRA PASSOU COM O DEFEITO NO LUGAR: 2.118 testes, e nenhum
 * cobria a travessia do artefato. Cada ponta funcionava sozinha; o que não
 * existia era o teste da ponte — o mesmo buraco do laço de 29/09, que é por
 * isso que este teste mora aqui.
 * ==========================================================================
 */
describe('o artefato que a ferramenta produz', () => {
  let cliente: AnthropicClient;
  let create: jest.Mock;

  const pedeProdutos = () => ({
    content: [
      { type: 'text', text: 'Vou olhar.' },
      {
        type: 'tool_use',
        id: 'tp',
        name: 'consultar_produtos',
        input: { busca: 'AN22083' },
      },
    ],
    usage: { output_tokens: 10 },
    stop_reason: 'tool_use',
  });

  const responde = (texto: string) => ({
    content: [{ type: 'text', text: texto }],
    usage: { output_tokens: 5 },
    stop_reason: 'end_turn',
  });

  const umaFoto = {
    codigo: 'AN22083',
    legenda: 'ANEL SOLITARIO — AN22083',
    conteudo: Buffer.from('PNG'),
    mime: 'image/png',
  };

  const achado = {
    produtos: [{ linha: 'ANEL SOLITARIO — AN22083: R$ 8.900, 1 em estoque' }],
    total: 1,
    semEstoque: 0,
    incluiuSemEstoque: false,
    foraDaCategoria: 0,
    fotos: [umaFoto],
    tinhamFoto: 1,
  };

  beforeEach(() => {
    cliente = new AnthropicClient({ get: () => 'chave-de-teste' } as never);
    create = jest.fn();
    (cliente as unknown as { client: unknown }).client = {
      messages: { create },
    };
  });

  const base = () =>
    ({
      model: 'claude-sonnet-5',
      maxTokens: 2048,
      system: 'voce e a Anastasia',
      mensagens: [{ role: 'user', content: 'me mostra o AN22083' }],
    }) as unknown as ChatParams;

  /* ESTE É O TESTE. O resto é contorno. */
  it('a foto achada pela ferramenta da GESTÃO sai do turno', async () => {
    create
      .mockResolvedValueOnce(pedeProdutos())
      .mockResolvedValueOnce(responde('Segue a foto.'));

    const r = await cliente.chatComFerramentas({
      ...base(),
      gestaoProdutos: jest.fn().mockResolvedValue(achado),
    });

    expect(r.fotos).toHaveLength(1);
    expect(r.fotos?.[0].codigo).toBe('AN22083');
  });

  it('e a da VENDEDORA também — são dois handlers com o mesmo nome', async () => {
    create
      .mockResolvedValueOnce(pedeProdutos())
      .mockResolvedValueOnce(responde('Segue a foto.'));

    const r = await cliente.chatComFerramentas({
      ...base(),
      consultarProdutos: jest.fn().mockResolvedValue(achado),
    });

    expect(r.fotos).toHaveLength(1);
  });

  /** Sem foto nenhuma, o turno não inventa um artefato vazio. */
  it('busca sem foto não leva nada junto', async () => {
    create
      .mockResolvedValueOnce(pedeProdutos())
      .mockResolvedValueOnce(responde('Nenhuma tem foto.'));

    const r = await cliente.chatComFerramentas({
      ...base(),
      gestaoProdutos: jest
        .fn()
        .mockResolvedValue({ ...achado, fotos: [], tinhamFoto: 0 }),
    });

    expect(r.fotos).toHaveLength(0);
  });

  /**
   * Ela pediu "sem foto": o campo tem de chegar ao handler como `false`.
   * Sem isto, o serviço baixa imagem que ninguém vai mandar.
   */
  it('o pedido de "só o texto" chega ao handler', async () => {
    const handler = jest.fn().mockResolvedValue({ ...achado, fotos: [] });
    create
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'tp',
            name: 'consultar_produtos',
            input: { busca: 'AN22083', com_foto: false },
          },
        ],
        usage: { output_tokens: 10 },
        stop_reason: 'tool_use',
      })
      .mockResolvedValueOnce(responde('Sem foto.'));

    await cliente.chatComFerramentas({ ...base(), gestaoProdutos: handler });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ comFoto: false }),
    );
  });

  /**
   * ========================================================================
   * A AGENDA DA SEMANA COLADA DE UMA VEZ — 08/10/2026.
   *
   * A gestora mandou sete dias num bloco de texto e pediu aviso uma hora
   * antes de cada compromisso. O teto de lembrete era BOOLEANO: o primeiro
   * entrava e os outros ouviam "você já guardou um lembrete neste turno" —
   * ela teria de repetir um por um, que é exatamente o que ela evitou ao
   * colar o bloco.
   *
   * O teto continua existindo — criação em massa, inclusive por injeção no
   * texto que um cliente escreveu —, mas agora é CONTADO, em vinte.
   * ========================================================================
   */
  describe('vários lembretes na mesma mensagem', () => {
    /** Uma resposta com N pedidos de lembrete, como o modelo faz de verdade. */
    const pedeLembretes = (n: number) => ({
      content: [
        { type: 'text', text: 'Vou guardar.' },
        ...Array.from({ length: n }, (_, i) => ({
          type: 'tool_use',
          id: `l${i}`,
          name: 'guardar_lembrete',
          input: {
            texto: `compromisso ${i}`,
            quandoIso: '2026-10-13T15:30:00-03:00',
          },
        })),
      ],
      usage: { output_tokens: 10 },
      stop_reason: 'tool_use',
    });

    /* ESTE É O TESTE. */
    it('a semana inteira entra de uma vez — sete compromissos, sete lembretes', async () => {
      const guardar = jest.fn().mockResolvedValue({ mensagem: 'Guardado.' });
      create
        .mockResolvedValueOnce(pedeLembretes(7))
        .mockResolvedValueOnce(responde('Guardei os sete.'));

      await cliente.chatComFerramentas({ ...base(), guardarLembrete: guardar });

      expect(guardar).toHaveBeenCalledTimes(7);
    });

    it('no vigésimo primeiro para, e DIZ quantos entraram', async () => {
      const guardar = jest.fn().mockResolvedValue({ mensagem: 'Guardado.' });
      create
        .mockResolvedValueOnce(pedeLembretes(25))
        .mockResolvedValueOnce(responde('Guardei vinte.'));

      await cliente.chatComFerramentas({ ...base(), guardarLembrete: guardar });

      expect(guardar).toHaveBeenCalledTimes(20);

      // E O QUE SOBROU NÃO SOME CALADO: o modelo recebe a conta e a ordem de
      // dizer o que faltou. Sem isto ele confirmaria vinte e calaria os cinco.
      const segunda = create.mock.calls[1][0] as { messages: unknown };
      const resultados = JSON.stringify(segunda.messages);
      expect(resultados).toContain('20 lembretes');
      expect(resultados).toMatch(/QUAIS faltaram/);
    });

    /**
     * O TETO DE UM POR TURNO CONTINUA onde ele protege de verdade: `avisar`
     * manda WhatsApp para OUTRA pessoa, e vinte numa colada seriam vinte
     * mensagens para a vendedora.
     */
    it('avisar vendedora continua em UM por turno', async () => {
      const avisar = jest.fn().mockResolvedValue({ mensagem: 'Avisada.' });
      create
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'a1',
              name: 'avisar_vendedora',
              input: { cliente: 'Carla' },
            },
            {
              type: 'tool_use',
              id: 'a2',
              name: 'avisar_vendedora',
              input: { cliente: 'Ana' },
            },
          ],
          usage: { output_tokens: 10 },
          stop_reason: 'tool_use',
        })
        .mockResolvedValueOnce(responde('Avisei uma.'));

      await cliente.chatComFerramentas({ ...base(), avisarVendedora: avisar });

      expect(avisar).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * ========================================================================
   * TODA CONSULTA PASSA PELO FUNIL QUE GUARDA A TABELA — RF36, 21/10/2026.
   *
   * O pedido foi *"queria que todas as consultas virassem PDF ou CSV"*, e a
   * captura mora no `executarLeitura` justamente para nao ser uma linha em
   * cada uma das ~30 ferramentas — uma linha que a ferramenta 31 esquece.
   *
   * O FURO ERA A AGENDA: ela era a unica leitura com try/catch proprio,
   * entao nao passava pelo funil. O sintoma ficava so no canal da Elena —
   * "minha agenda de hoje" e depois "manda em pdf" respondia que precisava
   * consultar primeiro. E ninguem notaria pela gestao, onde a agenda e outra
   * ferramenta.
   * ========================================================================
   */
  describe('a captura de toda consulta', () => {
    /** Uma resposta do modelo que PEDE uma ferramenta, sem argumentos. */
    const pede = (nome: string) => ({
      content: [{ type: 'tool_use', id: `tu-${nome}`, name: nome, input: {} }],
      usage: { output_tokens: 10 },
      stop_reason: 'tool_use',
    });

    it('a AGENDA tambem guarda a tabela — era a unica fora do funil', async () => {
      const aoResponder = jest.fn();
      create
        .mockResolvedValueOnce(pede('consultar_agenda'))
        .mockResolvedValueOnce(responde('Voce tem dois hoje.'));

      await cliente.chatComFerramentas({
        ...base(),
        consultarAgenda: jest.fn().mockResolvedValue({
          compromissos: [
            { cliente: 'Cliente A', quando: 'hoje 10:00' },
            { cliente: 'Cliente B', quando: 'hoje 15:00', ocasiao: 'ANIVERSARIO' },
          ],
        }),
        aoResponderConsulta: aoResponder,
      } as unknown as ChatParams);

      expect(aoResponder).toHaveBeenCalledTimes(1);
      expect(aoResponder.mock.calls[0][0]).toBe('consultar_agenda');
      expect(aoResponder.mock.calls[0][1]).toContain('Cliente A');
    });

    it('a falha da agenda nao derruba o turno, e nao guarda nada', async () => {
      const aoResponder = jest.fn();
      create
        .mockResolvedValueOnce(pede('consultar_agenda'))
        .mockResolvedValueOnce(responde('Nao consegui ver sua agenda agora.'));

      const r = await cliente.chatComFerramentas({
        ...base(),
        consultarAgenda: jest.fn().mockRejectedValue(new Error('banco fora')),
        aoResponderConsulta: aoResponder,
      } as unknown as ChatParams);

      expect(r.texto).toBeTruthy();
      expect(aoResponder).not.toHaveBeenCalled();
    });

    // ======================================================================
    // O PEDIDO VAI JUNTO COM O TEXTO — 26/10/2026.
    //
    // Sem ele o ouvinte sabe QUAL ferramenta respondeu e nao sabe O QUE foi
    // perguntado, e o arquivo sai sem dizer de quem e nem de quando:
    //
    //   "quais pecas mais vendidas da Camila em agosto 2026" -> "gera o pdf"
    //   -> um PDF chamado so "Itens mais vendidos".
    // ======================================================================
    it('o pedido do modelo vai junto, para o titulo levar o recorte', async () => {
      const aoResponder = jest.fn();
      const pedido = {
        vendedora: 'camila',
        de: '2026-08-01',
        ate: '2026-08-31',
      };
      create
        .mockResolvedValueOnce({
          content: [
            {
              type: 'tool_use',
              id: 'tu-itens',
              name: 'itens_mais_vendidos',
              input: pedido,
            },
          ],
          usage: { output_tokens: 10 },
          stop_reason: 'tool_use',
        })
        .mockResolvedValueOnce(responde('Seguem as pecas.'));

      await cliente.chatComFerramentas({
        ...base(),
        gestaoItens: jest.fn().mockResolvedValue({
          status: 'OK',
          linhas: ['BR26278 Brinco DTS — R$ 52.500'],
        }),
        aoResponderConsulta: aoResponder,
      } as unknown as ChatParams);

      expect(aoResponder.mock.calls[0][0]).toBe('itens_mais_vendidos');
      expect(aoResponder.mock.calls[0][2]).toEqual(pedido);
    });

    // ======================================================================
    // E O `mandar_relatorio` NAO GUARDA, de proposito.
    //
    // Ele nao e consulta: guardasse, a frase "o arquivo X esta pronto"
    // viraria "a ultima tabela", e o PDF seguinte sairia com ela dentro —
    // uma tabela de uma linha dizendo que um arquivo foi mandado.
    // ======================================================================
    it('o mandar_relatorio NAO entra na captura', async () => {
      const aoResponder = jest.fn();
      create
        .mockResolvedValueOnce(pede('mandar_relatorio'))
        .mockResolvedValueOnce(responde('Mandei em PDF.'));

      await cliente.chatComFerramentas({
        ...base(),
        // O HANDLER DEVOLVE O DESTINO, e nao o arquivo cru — 28/10/2026:
        // desde que a lista pode sair pela conversa, quem chama precisa
        // saber qual das duas coisas voltou. Ver `RelatorioEntregue`.
        mandarRelatorio: jest.fn().mockResolvedValue({
          tipo: 'ARQUIVO',
          arquivo: {
            conteudo: Buffer.from('%PDF-1.3'),
            mime: 'application/pdf',
            nome: 'vendas-21-10-2026.pdf',
            legenda: 'Vendas — 10 linhas',
          },
        }),
        aoResponderConsulta: aoResponder,
      } as unknown as ChatParams);

      expect(aoResponder).not.toHaveBeenCalled();
    });

    it('e o arquivo viaja por fora do dialogo, como as fotos', async () => {
      create
        .mockResolvedValueOnce(pede('mandar_relatorio'))
        .mockResolvedValueOnce(responde('Mandei em PDF.'));

      const r = await cliente.chatComFerramentas({
        ...base(),
        // O HANDLER DEVOLVE O DESTINO, e nao o arquivo cru — 28/10/2026:
        // desde que a lista pode sair pela conversa, quem chama precisa
        // saber qual das duas coisas voltou. Ver `RelatorioEntregue`.
        mandarRelatorio: jest.fn().mockResolvedValue({
          tipo: 'ARQUIVO',
          arquivo: {
            conteudo: Buffer.from('%PDF-1.3'),
            mime: 'application/pdf',
            nome: 'vendas-21-10-2026.pdf',
            legenda: 'Vendas — 10 linhas',
          },
        }),
      } as unknown as ChatParams);

      expect(r.arquivo?.nome).toBe('vendas-21-10-2026.pdf');
      // Os bytes NAO podem aparecer na conversa: seria pagar o arquivo em
      // token duas vezes, na ida e no historico.
      expect(JSON.stringify(create.mock.calls[1][0].messages)).not.toContain(
        '%PDF',
      );
    });

    /**
     * ======================================================================
     * A LISTA INTEIRA VIAJA POR FORA TAMBEM — 28/10/2026.
     *
     * *"Se nao tiver [quantidade] deve vir tudo de uma vez no WhatsApp."*
     *
     * As linhas NAO voltam para o dialogo, pelo mesmo motivo dos bytes do
     * PDF: seriam pagas em token duas vezes, na ida e no historico — e as
     * 1.412 vendas desde 2023 dao 73 mil tokens. O modelo recebe a CONTA
     * ("as 1.110 linhas ja estao escritas") e escreve uma frase.
     * ======================================================================
     */
    it('e a lista inteira tambem, sem as linhas voltarem ao dialogo', async () => {
      create
        .mockResolvedValueOnce(pede('mandar_relatorio'))
        .mockResolvedValueOnce(responde('Segue a lista.'));

      const r = await cliente.chatComFerramentas({
        ...base(),
        mandarRelatorio: jest.fn().mockResolvedValue({
          tipo: 'LISTA',
          mensagens: ['Vendas da Ylka', '1. 11/08/2026 | doc 1157'],
          linhas: 1110,
          total: 1110,
        }),
      } as unknown as ChatParams);

      expect(r.lista?.mensagens).toHaveLength(2);
      expect(r.lista?.linhas).toBe(1110);
      // UM OU O OUTRO: quem pediu a lista nao recebe tambem um anexo.
      expect(r.arquivo).toBeUndefined();
      // E as linhas nao entram no historico que volta ao modelo.
      expect(JSON.stringify(create.mock.calls[1][0].messages)).not.toContain(
        'doc 1157',
      );
    });
  });
});
