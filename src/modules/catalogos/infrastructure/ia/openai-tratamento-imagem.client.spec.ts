import { OpenaiTratamentoImagemClient } from './openai-tratamento-imagem.client';

/**
 * OS PROMPTS DE IMAGEM — 15 e 16/09/2026.
 *
 * PACKSHOT: o fundo e BRANCO, e so o pedido da pessoa muda isso. Em 15/09 o
 * tema da colecao pintava o fundo ("tema praiano" dava bege); o Lucas
 * corrigiu no dia seguinte — o tema e do CATALOGO, nao da joia.
 *
 * PECA NA MODELO e ARTE: a cena do catalogo entra, a regra da peca continua
 * abrindo e fechando, e a arte proibe pessoa, joia e texto.
 *
 * Eles nao chamam a OpenAI: o `fetch` e trocado por um dublê, e o que se
 * inspeciona e o que teria sido enviado.
 */
describe('OpenaiTratamentoImagemClient', () => {
  const PECA = { conteudo: Buffer.from('jpeg'), mime: 'image/jpeg' };

  let enviado: { url: string; prompt: string; size: string; formato: string };
  let cliente: OpenaiTratamentoImagemClient;

  beforeEach(() => {
    enviado = { url: '', prompt: '', size: '', formato: '' };
    global.fetch = jest.fn((url: string, init: { body: FormData | string }) => {
      enviado.url = url;
      if (typeof init.body === 'string') {
        const json = JSON.parse(init.body) as Record<string, string>;
        enviado.prompt = json.prompt;
        enviado.size = json.size;
        enviado.formato = json.output_format ?? '';
      } else {
        enviado.prompt = init.body.get('prompt') as string;
        enviado.size = init.body.get('size') as string;
        enviado.formato = (init.body.get('output_format') as string) ?? '';
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [{ b64_json: 'AAA=' }] }),
      });
    }) as never;

    cliente = new OpenaiTratamentoImagemClient({
      get: (chave: string) =>
        chave === 'OPENAI_API_KEY' ? 'sk-teste' : undefined,
    } as never);
  });

  describe('packshot', () => {
    it('sem pedido, o fundo e BRANCO', async () => {
      await cliente.tratar({
        original: PECA,
        padrao: null,
        pedidoDaPessoa: null,
      });

      expect(enviado.prompt).toContain('FUNDO: BRANCO liso e uniforme.');
      expect(enviado.size).toBe('1024x1024');
    });

    it('a composicao da colecao NAO tira o branco', async () => {
      await cliente.tratar({
        original: PECA,
        padrao: 'composicao: peça centralizada',
        pedidoDaPessoa: null,
      });

      expect(enviado.prompt).toContain('peça centralizada');
      expect(enviado.prompt).toContain('FUNDO: BRANCO liso e uniforme.');
    });

    it('o pedido da pessoa manda no fundo', async () => {
      const r = await cliente.tratar({
        original: PECA,
        padrao: null,
        pedidoDaPessoa: 'fundo rosa claro',
      });

      expect(enviado.prompt).toContain(
        'Pedido para esta peça: fundo rosa claro',
      );
      expect(enviado.prompt).toContain('FUNDO: siga o "Pedido para esta peça"');
      expect(r?.mime).toBe('image/png');
    });

    it('o enquadramento e fixo: de frente, sem cenario', async () => {
      await cliente.tratar({
        original: PECA,
        padrao: null,
        pedidoDaPessoa: null,
      });

      expect(enviado.prompt).toContain('DE FRENTE, na altura do olho');
      expect(enviado.prompt).toContain('Sem cenário, sem mesa');
    });

    it('a regra da peca intocada abre e fecha o prompt', async () => {
      await cliente.tratar({
        original: PECA,
        padrao: null,
        pedidoDaPessoa: null,
      });

      expect(enviado.prompt.split('REGRA ABSOLUTA').length - 1).toBe(2);
      expect(enviado.prompt.trim().endsWith('MANTENHA.')).toBe(true);
    });
  });

  describe('peca na modelo', () => {
    it('leva a cena, o lugar no corpo e a regra da peca nas duas pontas', async () => {
      const r = await cliente.ambientar({
        peca: PECA,
        cena: 'praia ao fim da tarde',
        modelo: 'um homem de uns 40 anos',
        onde: 'no pescoço',
        orientacao: 'retrato',
      });

      expect(enviado.url).toContain('/images/edits');
      expect(enviado.prompt).toContain('praia ao fim da tarde');
      expect(enviado.prompt).toContain('um homem de uns 40 anos');
      expect(enviado.prompt).toContain('no pescoço');
      // A luz e do tema: Natal nao e luz natural.
      expect(enviado.prompt).not.toContain('Luz natural');
      expect(enviado.prompt.split('REGRA ABSOLUTA').length - 1).toBe(2);
      // A regra do metal vale aqui tambem.
      expect(enviado.prompt).toContain('NÃO MUDE A COR DO METAL');
      expect(enviado.size).toBe('1024x1536');
      expect(enviado.formato).toBe('jpeg');
      expect(r?.mime).toBe('image/jpeg');
    });
  });

  describe('arte', () => {
    it('capa: geracao do zero, sem pessoa, joia nem texto', async () => {
      await cliente.gerarArte({
        tipo: 'capa',
        cena: 'praia',
        cores: ['#f4ece0', '#2a9d8f'],
        orientacao: 'paisagem',
      });

      expect(enviado.url).toContain('/images/generations');
      expect(enviado.prompt).toContain('SEM pessoas');
      expect(enviado.prompt).toContain('SEM texto');
      expect(enviado.size).toBe('1536x1024');
    });

    /**
     * O #0004 de 17/09: "capa de catálogo de JOIAS ... SEM joias" e a cena
     * falando em "verdes-esmeralda das joias" deram um par de brincos que o
     * catálogo não tem. A palavra não pode chegar à OpenAI.
     */
    it.each(['capa', 'fundo'] as const)(
      '%s: nenhuma palavra de joia chega ao prompt, nem vinda da cena',
      async (tipo) => {
        await cliente.gerarArte({
          tipo,
          cena:
            'Praia ao entardecer com areia clara. Conchas e pedras lisas. ' +
            'Luz dourada que realça os verdes-esmeralda das joias, criando reflexos.',
          cores: ['#f5f1ed', '#2d7a6b'],
          orientacao: 'retrato',
        });

        expect(enviado.prompt).toContain(
          'Praia ao entardecer com areia clara.',
        );
        expect(enviado.prompt).toContain('Conchas e pedras lisas.');
        expect(enviado.prompt).not.toMatch(/j[oó]ia|esmeralda|brinco|pe[cç]a/i);
      },
    );

    it('cena que só fala de joia vira cenário genérico, e não some o pedido', async () => {
      await cliente.gerarArte({
        tipo: 'capa',
        cena: 'Anéis de ouro com esmeralda sobre veludo.',
        cores: ['#ffffff'],
        orientacao: 'retrato',
      });

      expect(enviado.prompt).toContain('ambiente sofisticado');
      expect(enviado.prompt).not.toMatch(/anel|an[eé]is|esmeralda|ouro/i);
    });

    it('fundo: a cena nas bordas e o centro livre, na cor da pagina', async () => {
      await cliente.gerarArte({
        tipo: 'fundo',
        cena: 'praia',
        cores: ['#f4ece0', '#2a9d8f'],
        orientacao: 'retrato',
      });

      expect(enviado.prompt).toContain('SOMENTE nas bordas');
      expect(enviado.prompt).toContain('na cor #f4ece0');
    });
  });

  /**
   * A NOVA TENTATIVA — 16/09/2026.
   *
   * So o erro que pode passar em segundos e repetido, e uma vez so. Sem
   * credito, a segunda chamada daria o mesmo 429 — foi o caso real do dia.
   */
  describe('erro do provedor', () => {
    const ARTE = {
      tipo: 'capa' as const,
      cena: 'praia',
      cores: ['#ffffff'],
      orientacao: 'retrato' as const,
    };
    const erro = (status: number, corpo: string) => ({
      ok: false,
      status,
      text: () => Promise.resolve(corpo),
      headers: new Headers(),
    });
    const sucesso = {
      ok: true,
      json: () => Promise.resolve({ data: [{ b64_json: 'AAA=' }] }),
    };

    beforeEach(() => {
      cliente.esperaPadraoMs = 0;
    });

    it.each([
      [429, '{"error":{"code":"rate_limit_exceeded"}}'],
      [500, 'server error'],
      [503, 'overloaded'],
    ])(
      'HTTP %i: tenta de novo, e a segunda da certo',
      async (status, corpo) => {
        const chamada = jest
          .fn()
          .mockResolvedValueOnce(erro(status, corpo))
          .mockResolvedValueOnce(sucesso);
        global.fetch = chamada as never;

        expect(await cliente.gerarArte(ARTE)).not.toBeNull();
        expect(chamada).toHaveBeenCalledTimes(2);
      },
    );

    it('SEM CREDITO nao repete — o erro seria o mesmo', async () => {
      const chamada = jest
        .fn()
        .mockResolvedValue(
          erro(
            429,
            '{"error":{"type":"insufficient_quota","code":"credit_balance_exhausted"}}',
          ),
        );
      global.fetch = chamada as never;

      expect(await cliente.gerarArte(ARTE)).toBeNull();
      expect(chamada).toHaveBeenCalledTimes(1);
    });

    it('imagem recusada (400) nao repete', async () => {
      const chamada = jest
        .fn()
        .mockResolvedValue(erro(400, 'moderation_blocked'));
      global.fetch = chamada as never;

      expect(await cliente.gerarArte(ARTE)).toBeNull();
      expect(chamada).toHaveBeenCalledTimes(1);
    });

    it('timeout nao repete — ja esperou o teto inteiro', async () => {
      const timeout = Object.assign(new Error('aborted'), {
        name: 'TimeoutError',
      });
      const chamada = jest.fn().mockRejectedValue(timeout);
      global.fetch = chamada as never;

      expect(await cliente.gerarArte(ARTE)).toBeNull();
      expect(chamada).toHaveBeenCalledTimes(1);
    });

    it('queda de rede repete uma vez, e so uma', async () => {
      const chamada = jest
        .fn()
        .mockRejectedValue(new TypeError('fetch failed'));
      global.fetch = chamada as never;

      expect(await cliente.gerarArte(ARTE)).toBeNull();
      expect(chamada).toHaveBeenCalledTimes(2);
    });
  });
});
