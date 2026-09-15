import { OpenaiTratamentoImagemClient } from './openai-tratamento-imagem.client';

/**
 * O PROMPT DO TRATAMENTO — HML-17, 15/09/2026.
 *
 * O Yerlon apontou na homologacao: o catalogo diz "cores quentes" ou "cor
 * escura" e a foto sai sempre branca. A causa nao era a colecao faltar no
 * prompt — era ela chegar DEPOIS de um "Fundo BRANCO liso e uniforme" fixo,
 * em maiusculas. Duas ordens no mesmo texto, e o modelo ficava com a primeira.
 *
 * O que estes testes protegem e a PRECEDENCIA, dita com todas as letras:
 *
 *   pedido da pessoa > padrao da colecao > branco
 *
 * Eles nao chamam a OpenAI: o `fetch` e trocado por um dublê, e o que se
 * inspeciona e o texto que teria sido enviado.
 */
describe('OpenaiTratamentoImagemClient — a cor do fundo', () => {
  const PECA = { conteudo: Buffer.from('jpeg'), mime: 'image/jpeg' };

  let enviado: string;
  let cliente: OpenaiTratamentoImagemClient;

  beforeEach(() => {
    enviado = '';
    global.fetch = jest.fn((_url: unknown, init: { body: FormData }) => {
      enviado = init.body.get('prompt') as string;
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

  it('sem colecao e sem pedido, o fundo e BRANCO', async () => {
    await cliente.tratar({
      original: PECA,
      padrao: null,
      pedidoDaPessoa: null,
    });

    expect(enviado).toContain('FUNDO: BRANCO liso e uniforme.');
  });

  it('com a colecao dizendo algo, o branco SAI do prompt', async () => {
    // O defeito inteiro morava aqui: antes, "Fundo BRANCO" continuava escrito
    // mesmo quando a colecao pedia outra coisa.
    await cliente.tratar({
      original: PECA,
      padrao: 'observacao: tema praiano, férias',
      pedidoDaPessoa: null,
    });

    expect(enviado).toContain('tema praiano, férias');
    expect(enviado).toContain('FUNDO: siga o "Padrão desta coleção"');
    expect(enviado).not.toContain('BRANCO');
  });

  it('o pedido da pessoa vence o padrao da colecao', async () => {
    await cliente.tratar({
      original: PECA,
      padrao: 'observacao: fundo escuro',
      pedidoDaPessoa: 'fundo rosa claro',
    });

    expect(enviado).toContain('FUNDO: siga o "Pedido para esta peça"');
    expect(enviado).toContain('Ele vence o padrão da coleção.');
  });

  it('o enquadramento e o mesmo em todos os casos', async () => {
    // O que nao se negocia continua fixo: de frente, centralizada, fundo liso,
    // sem cenario. O tema muda a COR, e nao a forma de fotografar.
    for (const padrao of [null, 'observacao: tema praiano']) {
      await cliente.tratar({ original: PECA, padrao, pedidoDaPessoa: null });

      expect(enviado).toContain('DE FRENTE, na altura do olho');
      expect(enviado).toContain('Sem cenário, sem mesa');
      expect(enviado).toContain('Fundo liso e uniforme');
    }
  });

  it('a regra da peca intocada abre e fecha o prompt', async () => {
    await cliente.tratar({
      original: PECA,
      padrao: 'observacao: fundo escuro',
      pedidoDaPessoa: null,
    });

    const ocorrencias = enviado.split('REGRA ABSOLUTA').length - 1;
    expect(ocorrencias).toBe(2);
    expect(enviado.trim().endsWith('MANTENHA.')).toBe(true);
  });
});
