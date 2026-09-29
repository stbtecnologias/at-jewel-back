import {
  MINIMO_PARA_RANQUEAR,
  RankingsDeAtendimentoUseCase,
} from './rankings-de-atendimento.use-case';

/**
 * OS CINCO RANKINGS — ANA-14, 29/09/2026.
 *
 * ==========================================================================
 * UM RANKING ERRADO NAO PARECE ERRADO. ELE PARECE UM RANKING.
 *
 * Os dois modos de mentir que estes testes guardam:
 *
 *   1. RANQUEAR PELO TEMPO CORRIDO. Cliente escreve 23h40, vendedora responde
 *      8h10: corrido sao 8h30 e ela e a pior; no relogio da loja sao 10
 *      minutos e ela e a melhor. Como o telefone corporativo recebe a
 *      qualquer hora, o corrido ordenaria por QUANDO a cliente escreveu.
 *
 *   2. RANQUEAR SEM PISO DE AMOSTRA. Quem atendeu UM cliente em 2 minutos
 *      vence quem atendeu quarenta com media de 8. O numero e verdadeiro e a
 *      conclusao e falsa — e e a conclusao que vira conversa de feedback.
 * ==========================================================================
 */
describe('os rankings de atendimento', () => {
  const JANELA = { de: new Date(2026, 8, 1), ate: new Date(2026, 8, 30) };
  const em = (dia: number, h: number, m = 0) => new Date(2026, 8, dia, h, m);

  let repo: Record<string, jest.Mock>;
  let useCase: RankingsDeAtendimentoUseCase;

  beforeEach(() => {
    repo = {
      paresDeResposta: jest.fn().mockResolvedValue([]),
      desfechoPorVendedora: jest.fn().mockResolvedValue([]),
      interacoesPorVendedora: jest.fn().mockResolvedValue([]),
      leadsPorVendedora: jest.fn().mockResolvedValue([]),
      tempoAteFecharVenda: jest.fn().mockResolvedValue({
        minutos: null, amostra: 0, minimo: null, maximo: null,
      }),
    };
    useCase = new RankingsDeAtendimentoUseCase(repo as never);
  });

  describe('quem responde mais rápido', () => {
    /*
     * O CASO QUE INVERTE O PODIO.
     *
     * A Marina pega as mensagens da madrugada e responde as 08h05. A Bianca
     * recebe as 14h e responde as 15h. Pelo corrido a Marina e tres vezes
     * pior; pelo relogio da loja ela e doze vezes melhor.
     */
    it('ordena pelo relógio da LOJA, não pelo tempo corrido', async () => {
      repo.paresDeResposta.mockResolvedValue([
        // Marina: escreveram 23h40, respondeu 8h05 -> 5 min de loja, 505 corridos
        { vendedoraId: 'm', nome: 'Marina', contatoEm: em(10, 23, 40), respostaEm: em(11, 8, 5) },
        { vendedoraId: 'm', nome: 'Marina', contatoEm: em(12, 23, 40), respostaEm: em(13, 8, 5) },
        // Bianca: 14h -> 15h, uma hora em plena loja
        { vendedoraId: 'b', nome: 'Bianca', contatoEm: em(10, 14), respostaEm: em(10, 15) },
        { vendedoraId: 'b', nome: 'Bianca', contatoEm: em(12, 14), respostaEm: em(12, 15) },
      ]);

      const r = await useCase.execute(JANELA);

      expect(r.respondeMaisRapido.map((p) => p.nome)).toEqual(['Marina', 'Bianca']);
      expect(r.respondeMaisRapido[0].valor).toBe(5);
      // O corrido vai junto, e mostra o esforço que o relógio da loja apaga.
      expect(r.respondeMaisRapido[0].corrido).toBe(505);
    });

    it('o corrido nunca é menor que o tempo de loja', async () => {
      repo.paresDeResposta.mockResolvedValue([
        { vendedoraId: 'm', nome: 'Marina', contatoEm: em(10, 20), respostaEm: em(11, 9) },
        { vendedoraId: 'm', nome: 'Marina', contatoEm: em(11, 10), respostaEm: em(11, 11) },
      ]);

      const [p] = (await useCase.execute(JANELA)).respondeMaisRapido;
      expect(p.corrido!).toBeGreaterThanOrEqual(p.valor);
    });

    /* Um caso só não é média: é anedota com aparência de indicador. */
    it('quem tem menos que o mínimo fica FORA — e é nomeado', async () => {
      repo.paresDeResposta.mockResolvedValue([
        { vendedoraId: 'u', nome: 'Única', contatoEm: em(10, 10), respostaEm: em(10, 10, 2) },
        { vendedoraId: 'b', nome: 'Bianca', contatoEm: em(10, 14), respostaEm: em(10, 15) },
        { vendedoraId: 'b', nome: 'Bianca', contatoEm: em(11, 14), respostaEm: em(11, 15) },
      ]);

      const r = await useCase.execute(JANELA);

      expect(r.respondeMaisRapido.map((p) => p.nome)).toEqual(['Bianca']);
      // Ficar de fora sem aparecer leria como "não atendeu".
      expect(r.semAmostra).toContain('Única');
    });

    it('o mínimo é 2, e tem nome no código', () => {
      expect(MINIMO_PARA_RANQUEAR).toBe(2);
    });
  });

  describe('quem mais converte', () => {
    it('ordena por percentual, não por quantidade de ganhos', async () => {
      repo.desfechoPorVendedora.mockResolvedValue([
        { codigo: '1', nome: 'Volume', ganhos: 6, perdidos: 14 }, // 30%
        { codigo: '2', nome: 'Precisa', ganhos: 3, perdidos: 1 }, // 75%
      ]);

      const r = await useCase.execute(JANELA);
      expect(r.maisConverte.map((p) => p.nome)).toEqual(['Precisa', 'Volume']);
      expect(r.maisConverte[0].valor).toBe(75);
      // A amostra vai junto: 75% de 4 não é 30% de 20.
      expect(r.maisConverte[0].amostra).toBe(4);
    });

    it('quem tem um único lead decidido fica fora', async () => {
      repo.desfechoPorVendedora.mockResolvedValue([
        { codigo: '1', nome: 'Sortuda', ganhos: 1, perdidos: 0 },
      ]);

      const r = await useCase.execute(JANELA);
      expect(r.maisConverte).toHaveLength(0);
      expect(r.semAmostra).toContain('Sortuda');
    });
  });

  describe('quem recebe mais leads', () => {
    it('ordena por quantidade', async () => {
      repo.leadsPorVendedora.mockResolvedValue([
        { vendedoraId: 'a', codigo: '1', nome: 'Ana', quantos: 3 },
        { vendedoraId: 'b', codigo: '2', nome: 'Bia', quantos: 9 },
      ]);

      const r = await useCase.execute(JANELA);
      expect(r.maisLeads.map((p) => p.nome)).toEqual(['Bia', 'Ana']);
    });

    /* "sem vendedora" e um AGREGADO do que ninguem assumiu, e nao uma pessoa.
     * Deixa-lo competir poria um fantasma no primeiro lugar. */
    it('"sem vendedora" não disputa o ranking', async () => {
      repo.leadsPorVendedora.mockResolvedValue([
        { vendedoraId: null, codigo: null, nome: 'sem vendedora', quantos: 50 },
        { vendedoraId: 'a', codigo: '1', nome: 'Ana', quantos: 3 },
      ]);

      const r = await useCase.execute(JANELA);
      expect(r.maisLeads.map((p) => p.nome)).toEqual(['Ana']);
    });
  });

  it('a janela chega igual em todas as consultas', async () => {
    await useCase.execute(JANELA);
    for (const m of Object.values(repo)) {
      expect(m).toHaveBeenCalledWith(JANELA);
    }
  });

  it('sem dado nenhum, os cinco eixos voltam vazios — e não com zeros', async () => {
    const r = await useCase.execute(JANELA);
    expect(r.respondeMaisRapido).toEqual([]);
    expect(r.maisConverte).toEqual([]);
    expect(r.maisLeads).toEqual([]);
    expect(r.maisInterage).toEqual([]);
    expect(r.fechaMaisRapido).toEqual([]);
  });
});
