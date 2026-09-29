import {
  MetricasDeAtendimentoUseCase,
  comAmostra,
  emPortugues,
  fraseDaConversao,
} from './metricas-de-atendimento.use-case';

/**
 * AS METRICAS DE ATENDIMENTO — ANA-08 a ANA-12, 29/09/2026.
 *
 * ==========================================================================
 * O QUE ESTES TESTES GUARDAM E A DIFERENCA ENTRE ZERO E NADA.
 *
 * O SQL e conferido contra a copia de producao. O que erro nenhum denuncia e
 * uma media vazia virando `0`: a tela mostraria "primeira resposta em 0 min"
 * — indicador perfeito — exatamente quando NAO HOUVE atendimento nenhum.
 *
 * E o mesmo erro que derrubou a tela de Produtos em 28/09, quando um valor
 * ausente virou zero e o inventario apareceu zerado.
 * ==========================================================================
 */
describe('as métricas de atendimento', () => {
  const VAZIA = { minutos: null, amostra: 0, minimo: null, maximo: null };

  describe('minutos em português', () => {
    it.each([
      [null, 'sem dado'],
      [0, 'menos de um minuto'],
      [0.4, 'menos de um minuto'],
      [1, '1 min'],
      [45, '45 min'],
      [59, '59 min'],
      [60, '1h'],
      [90, '1h30'],
      [125, '2h05'],
      [1440, '1 dia'],
      [2880, '2 dias'],
      [2160, '1,5 dias'],
    ])('%s minutos -> "%s"', (minutos, esperado) => {
      expect(emPortugues(minutos)).toBe(esperado);
    });

    /* "1.437 minutos" nao e resposta: e conta de cabeca para quem le no
     * WhatsApp. A precisao perdida nao muda decisao; a leitura muda. */
    it('nunca devolve um número cru de minutos acima de uma hora', () => {
      for (const m of [61, 500, 5000, 100000]) {
        expect(emPortugues(m)).not.toMatch(/^\d+$/);
      }
    });
  });

  describe('a amostra vai junto da média', () => {
    it('sem nenhum caso, diz isso — e não mostra um tempo', () => {
      const frase = comAmostra(VAZIA, 'Primeira resposta');
      expect(frase).toBe('Primeira resposta: ainda sem nenhum caso no período.');
      expect(frase).not.toMatch(/\d+\s*min|\bh\b|dias?/);
    });

    /*
     * A AMOSTRA APARECE SEMPRE, E NAO SO QUANDO E PEQUENA.
     *
     * Em 29/09/2026 a base tinha UM lead e UM celular conectado. Uma media de
     * "18 min" sobre um unico atendimento parece indicador e e anedota.
     */
    it('com um caso só, o número vem acompanhado do tamanho', () => {
      const frase = comAmostra({ ...VAZIA, minutos: 18, amostra: 1, minimo: 18, maximo: 18 }, 'Primeira resposta');
      expect(frase).toContain('18 min');
      expect(frase).toContain('1 caso');
      // Faixa com um caso só seria "do mais rápido 18 min ao mais lento 18 min".
      expect(frase).not.toContain('mais rápido');
    });

    it('com vários, mostra a faixa que a média esconde', () => {
      const frase = comAmostra({ minutos: 120, amostra: 9, minimo: 5, maximo: 2880 }, 'Atendimento');
      expect(frase).toContain('9 casos');
      expect(frase).toContain('mais rápido 5 min');
      expect(frase).toContain('mais lento 2 dias');
    });
  });

  describe('a busca', () => {
    let repo: Record<string, jest.Mock>;
    let useCase: MetricasDeAtendimentoUseCase;

    beforeEach(() => {
      repo = {
        leadsPorVendedora: jest.fn().mockResolvedValue([]),
        interacoesPorVendedora: jest.fn().mockResolvedValue([]),
        tempoPrimeiraResposta: jest.fn().mockResolvedValue(VAZIA),
        tempoDeAtendimento: jest.fn().mockResolvedValue(VAZIA),
        tempoAteFecharVenda: jest.fn().mockResolvedValue(VAZIA),
        conversao: jest.fn().mockResolvedValue({ ganhos: 0, perdidos: 0, emAberto: 0, taxa: null }),
      };
      useCase = new MetricasDeAtendimentoUseCase(repo as never);
    });

    it('a janela chega igual nas seis', async () => {
      const janela = { de: new Date(2026, 8, 1), ate: new Date(2026, 8, 30) };
      await useCase.execute(janela);

      for (const m of Object.values(repo)) {
        expect(m).toHaveBeenCalledWith(janela);
      }
    });

    /* O recorte de equipe da gerente propaga sozinho: `null` e a loja, `[]` e
     * "a equipe dela nao tem ninguem" — e sao respostas diferentes. */
    it('o recorte de equipe vazio NÃO vira a loja inteira', async () => {
      const janela = { de: new Date(2026, 8, 1), ate: new Date(2026, 8, 30), vendedoraIds: [] };
      await useCase.execute(janela);

      expect(repo.leadsPorVendedora).toHaveBeenCalledWith(
        expect.objectContaining({ vendedoraIds: [] }),
      );
    });

    it('sem dado nenhum, os tempos ficam null — e não zero', async () => {
      const r = await useCase.execute({ de: new Date(), ate: new Date() });

      expect(r.primeiraResposta.minutos).toBeNull();
      expect(r.duracaoDoAtendimento.minutos).toBeNull();
      expect(r.ateFecharVenda.minutos).toBeNull();
      expect(r.primeiraResposta.minutos).not.toBe(0);
    });
  });
});

/**
 * A TAXA DE CONVERSAO — ANA-13, 29/09/2026.
 *
 * ==========================================================================
 * ESTES TESTES GUARDAM O DENOMINADOR, QUE E ONDE A METRICA MENTE.
 *
 * Dividir ganhos pelo TOTAL faria a conversao despencar sozinha a cada lead
 * novo — quem chegou ontem entraria no denominador como se tivesse recusado.
 * No fim de uma semana movimentada o numero pioraria justamente porque a
 * operacao foi bem, e ninguem desconfiaria de um percentual.
 * ==========================================================================
 */
describe('a taxa de conversão', () => {
  const c = (ganhos: number, perdidos: number, emAberto: number) => {
    const decididos = ganhos + perdidos;
    return {
      ganhos,
      perdidos,
      emAberto,
      taxa: decididos === 0 ? null : Math.round((ganhos / decididos) * 100),
    };
  };

  it('a conta é sobre quem teve DESFECHO, não sobre o total', () => {
    // 3 ganhos, 1 perdido, 96 em aberto. Sobre o total daria 3%.
    expect(fraseDaConversao(c(3, 1, 96))).toContain('75%');
  });

  it('o lead em aberto não entra no denominador — mas aparece na frase', () => {
    const frase = fraseDaConversao(c(3, 1, 96));
    expect(frase).toContain('3 de 4');
    expect(frase).toContain('96 ainda em aberto');
  });

  /*
   * NADA FECHADO NAO E ZERO POR CENTO.
   *
   * Zero afirma "ninguem comprou". Aqui ninguem terminou de decidir — e a
   * diferenca entre as duas frases muda o que a gestao faz na segunda-feira.
   */
  it('sem nenhum desfecho, NÃO diz 0%', () => {
    const frase = fraseDaConversao(c(0, 0, 12));
    expect(frase).not.toContain('0%');
    expect(frase).toContain('nenhum lead teve desfecho');
    expect(frase).toContain('12 em aberto');
  });

  it('sem lead nenhum, diz isso e não inventa taxa', () => {
    const frase = fraseDaConversao(c(0, 0, 0));
    expect(frase).toBe('Conversão: nenhum lead no período.');
    expect(frase).not.toContain('%');
  });

  it('tudo perdido é 0% de verdade — e isso pode ser dito', () => {
    expect(fraseDaConversao(c(0, 5, 0))).toContain('0%');
  });

  it('tudo ganho é 100%', () => {
    expect(fraseDaConversao(c(4, 0, 0))).toContain('100%');
  });

  /* A porcentagem nunca sai sozinha: "40%" esconde se foram 2 de 5 ou 200 de
   * 500, e uma amostra minuscula passaria por indicador. */
  it.each([
    [1, 1, 0],
    [2, 3, 7],
    [50, 50, 0],
  ])('com %s/%s o denominador sempre aparece', (g, p, a) => {
    expect(fraseDaConversao(c(g, p, a))).toMatch(new RegExp(`${g} de ${g + p}`));
  });
});
