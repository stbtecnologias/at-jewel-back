import {
  MetricasDeAtendimentoUseCase,
  comAmostra,
  emPortugues,
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
      };
      useCase = new MetricasDeAtendimentoUseCase(repo as never);
    });

    it('a janela chega igual nas cinco', async () => {
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
