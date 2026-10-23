import { ConsultarLinhaDoTempoUseCase } from './consultar-linha-do-tempo.use-case';
import type { PontoDaLinha } from '../../domain/ports/repositories/atendimento-repository.port';

/**
 * A LINHA DO TEMPO DIZ TAMBEM O QUE NAO ACONTECEU.
 *
 * Duas regras aqui nao sao detalhe de tela, sao o sentido da leitura:
 *
 *   1. faixa VAZIA aparece — uma vendedora sem nenhum ponto o dia inteiro e
 *      informacao, e das fortes. Escondendo, ausencia vira silencio;
 *   2. o recuo para o ultimo dia com movimento so vale quando NINGUEM pediu um
 *      dia. Se alguem escolheu 07/09, 07/09 vazio e a resposta correta —
 *      trocar por baixo seria mentir sobre o que ele esta olhando.
 */
describe('ConsultarLinhaDoTempoUseCase', () => {
  const HOJE = new Date(2026, 8, 8, 14, 30); // 08/09/2026, uma terca

  let repo: { linhaDoTempo: jest.Mock; ultimoDiaComMovimento: jest.Mock };
  let vendedoras: { listar: jest.Mock };
  let genteDaCasa: { mapa: jest.Mock };
  let clientes: { idsComTelefoneEm: jest.Mock };
  let uc: ConsultarLinhaDoTempoUseCase;

  function ponto(
    vendedoraId: string,
    nome: string,
    hora: number,
    extra: Partial<PontoDaLinha> = {},
  ): PontoDaLinha {
    return {
      id: `interacao:${vendedoraId}-${hora}`,
      tipo: 'RELATO',
      vendedoraId,
      vendedoraNome: nome,
      em: new Date(2026, 8, 8, hora, 0),
      clienteId: 'cli-1',
      clienteNome: 'Karina',
      combinadoEm: null,
      valor: null,
      desfecho: null,
      atendimentoId: 'at-1',
      sessao: null,
      chatId: null,
      relato: 'foi bem',
      etapa: null,
      ...extra,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(HOJE);
    repo = {
      linhaDoTempo: jest.fn().mockResolvedValue([]),
      ultimoDiaComMovimento: jest.fn().mockResolvedValue(null),
    };
    vendedoras = { listar: jest.fn().mockResolvedValue([]) };
    // NINGUEM DA CASA POR PADRAO: assim todo teste que nao e sobre a etiqueta
    // segue valendo exatamente o que valia. Os da etiqueta trocam estes dois.
    genteDaCasa = {
      mapa: jest.fn().mockResolvedValue({
        vazio: () => true,
        hashes: () => [],
        papelDoHash: () => null,
        papelDoChat: () => null,
      }),
    };
    clientes = { idsComTelefoneEm: jest.fn().mockResolvedValue([]) };
    uc = new ConsultarLinhaDoTempoUseCase(
      repo as never,
      vendedoras as never,
      genteDaCasa as never,
      clientes as never,
    );
  });

  afterEach(() => jest.useRealTimers());

  // =========================================================================
  // O RECORTE DA EQUIPE — 23/10/2026.
  //
  // A regua tem uma faixa por vendedora, com o nome dela em cima. Para a
  // gerente de vendas, as quatro de fora da equipe nao podem aparecer — nem
  // como faixa vazia, que e justamente o que esta tela faz questao de mostrar
  // para todo mundo mais.
  // =========================================================================
  describe('o recorte da equipe', () => {
    beforeEach(() => {
      vendedoras.listar.mockResolvedValue([
        { id: 'v-1', nome: 'Camila' },
        { id: 'v-9', nome: 'Faby' },
      ]);
      repo.linhaDoTempo.mockResolvedValue([
        ponto('v-1', 'Camila', 9),
        ponto('v-9', 'Faby', 10),
      ]);
    });

    it('sem equipe, a regua tem as duas — nada muda para a gestao', async () => {
      const r = await uc.execute('2026-09-08');

      expect(r.faixas.map((f) => f.vendedoraId).sort()).toEqual(['v-1', 'v-9']);
    });

    it('com equipe, a de fora some da regua — faixa e pontos', async () => {
      const r = await uc.execute('2026-09-08', ['v-1']);

      expect(r.faixas.map((f) => f.vendedoraId)).toEqual(['v-1']);
      expect(JSON.stringify(r)).not.toContain('Faby');
    });

    /*
     * QUEM TEVE MOVIMENTO E NAO ESTA MAIS ATIVA AINDA APARECE — e a regra
     * desta tela desde sempre. O recorte nao pode trazer de volta por essa
     * porta quem ele acabou de tirar pela outra.
     */
    it('nem pela porta de quem saiu: ponto de fora da equipe nao vira faixa', async () => {
      vendedoras.listar.mockResolvedValue([{ id: 'v-1', nome: 'Camila' }]);

      const r = await uc.execute('2026-09-08', ['v-1']);

      expect(r.faixas).toHaveLength(1);
    });
  });

  it('sem dia pedido, olha hoje — da meia-noite a meia-noite', async () => {
    await uc.execute();

    const [de, ate] = repo.linhaDoTempo.mock.calls[0];
    expect(de).toEqual(new Date(2026, 8, 8, 0, 0, 0, 0));
    expect(ate).toEqual(new Date(2026, 8, 9, 0, 0, 0, 0));
  });

  /**
   * `new Date('2026-09-08')` daria meia-noite em UTC, que aqui e 21h do dia 7
   * — e a tela mostraria o dia anterior a partir das 21h. Este teste existe
   * para a correcao nao ser desfeita por parecer verbosa.
   */
  it('interpreta o dia pedido no fuso local, e nao em UTC', async () => {
    await uc.execute('2026-09-08');

    const [de] = repo.linhaDoTempo.mock.calls[0];
    expect(de.getDate()).toBe(8);
    expect(de.getHours()).toBe(0);
  });

  // O recuo automatico existiu ate 09/09/2026 e foi removido: a tela abria no
  // ultimo dia com movimento — o 26 — e quem olhava de relance lia aquilo como
  // hoje. Estes testes protegem a regra que ficou no lugar.
  describe('o dia mostrado', () => {
    it('sem dia pedido, abre em HOJE mesmo com a base parada', async () => {
      repo.linhaDoTempo.mockResolvedValue([]);
      repo.ultimoDiaComMovimento.mockResolvedValue(new Date(2026, 7, 26));

      const r = await uc.execute();

      expect(r.dia).toBe('2026-09-08');
      expect(repo.ultimoDiaComMovimento).not.toHaveBeenCalled();
    });

    it('hoje vazio devolve as faixas vazias, e nao outro dia', async () => {
      repo.linhaDoTempo.mockResolvedValue([]);

      const r = await uc.execute();

      expect(r.dia).toBe('2026-09-08');
      expect(r.faixas.every((f) => f.pontos.length === 0)).toBe(true);
    });

    it('respeita o dia pedido a dedo', async () => {
      const r = await uc.execute('2026-09-07');

      expect(r.dia).toBe('2026-09-07');
      expect(repo.ultimoDiaComMovimento).not.toHaveBeenCalled();
    });
  });

  describe('as faixas', () => {
    it('toda vendedora ativa tem faixa, mesmo sem ponto nenhum', async () => {
      vendedoras.listar.mockResolvedValue([
        { id: 'v1', nome: 'Marina' },
        { id: 'v2', nome: 'Bianca' },
      ]);
      repo.linhaDoTempo.mockResolvedValue([ponto('v1', 'Marina', 9)]);

      const r = await uc.execute();

      expect(r.faixas).toHaveLength(2);
      expect(r.faixas.map((f) => f.vendedoraNome)).toEqual(['Bianca', 'Marina']);
      // Pelo nome: a Bianca vem primeiro, e e ela quem esta sem ponto.
      const bianca = r.faixas.find((f) => f.vendedoraNome === 'Bianca');
      expect(bianca?.pontos).toEqual([]);
    });

    /**
     * ALFABETICA, e nao por movimento. Ordenar por atividade fazia as faixas
     * dancarem todo dia — a mesma pessoa mudando de linha conforme o
     * movimento, e ninguem conseguindo dizer "a Marina e a terceira".
     */
    it('ordena pelo nome, e nao por quantidade de pontos', async () => {
      vendedoras.listar.mockResolvedValue([
        { id: 'v1', nome: 'Marina' },
        { id: 'v2', nome: 'Bianca' },
        { id: 'v3', nome: 'Ana' },
      ]);
      repo.linhaDoTempo.mockResolvedValue([
        ponto('v2', 'Bianca', 9),
        ponto('v2', 'Bianca', 10),
        ponto('v1', 'Marina', 11),
      ]);

      const r = await uc.execute();

      // A Ana vem primeiro mesmo sem nenhum ponto, e a Bianca por ultimo
      // mesmo tendo dois: a posicao e do nome, nao do movimento.
      expect(r.faixas.map((f) => f.vendedoraNome)).toEqual([
        'Ana',
        'Bianca',
        'Marina',
      ]);
    });

    /** O dia dela aconteceu. Apagar a faixa reescreveria o passado. */
    it('quem foi desligada mas teve movimento continua aparecendo', async () => {
      vendedoras.listar.mockResolvedValue([{ id: 'v1', nome: 'Marina' }]);
      repo.linhaDoTempo.mockResolvedValue([ponto('v9', 'Renata (saiu)', 9)]);

      const r = await uc.execute();

      expect(r.faixas.map((f) => f.vendedoraNome)).toEqual([
        'Marina',
        'Renata (saiu)',
      ]);
    });

    it('vendedora sem id na base nao vira faixa fantasma', async () => {
      vendedoras.listar.mockResolvedValue([{ id: undefined, nome: 'Sem id' }]);

      const r = await uc.execute();

      expect(r.faixas).toEqual([]);
    });
  });

  /**
   * O FUNIL DENTRO DA LINHA DO TEMPO — 22/09/2026.
   *
   * A regra que estes testes travam e uma so: a barra conta EPISODIOS, e nao
   * pontos. Sem isso, a cliente que mandou oito mensagens ocuparia o espaco de
   * oito clientes, e a faixa mentiria justamente no numero que se le de
   * relance.
   */
  describe('o funil da faixa', () => {
    beforeEach(() => {
      vendedoras.listar.mockResolvedValue([{ id: 'v1', nome: 'Marina' }]);
    });

    it('oito pontos do mesmo atendimento sao UM em negociacao', async () => {
      repo.linhaDoTempo.mockResolvedValue(
        Array.from({ length: 8 }, (_, i) =>
          ponto('v1', 'Marina', 9 + i, {
            atendimentoId: 'at-1',
            etapa: 'EM_NEGOCIACAO',
          }),
        ),
      );

      const r = await uc.execute();

      expect(r.faixas[0].porEtapa.EM_NEGOCIACAO).toBe(1);
      expect(r.faixas[0].atendimentos).toBe(1);
      expect(r.faixas[0].pontos).toHaveLength(8);
    });

    it('conta cada atendimento na sua etapa', async () => {
      repo.linhaDoTempo.mockResolvedValue([
        ponto('v1', 'Marina', 9, { atendimentoId: 'at-1', etapa: 'CONCLUIDO' }),
        ponto('v1', 'Marina', 10, { atendimentoId: 'at-2', etapa: 'REMARCADO' }),
        ponto('v1', 'Marina', 11, { atendimentoId: 'at-3', etapa: 'REMARCADO' }),
      ]);

      const r = await uc.execute();

      expect(r.faixas[0].porEtapa.REMARCADO).toBe(2);
      expect(r.faixas[0].porEtapa.CONCLUIDO).toBe(1);
      expect(r.faixas[0].atendimentos).toBe(3);
    });

    /**
     * Venda, consignacao e lead encaminhado nascem sem atendimento. Eles CONTAM
     * como movimento do dia — a faixa deixa de dizer "sem registro" — mas nao
     * tem etapa, e entrar na barra somaria coisas de naturezas diferentes.
     */
    it('ponto sem atendimento nao entra em etapa nenhuma', async () => {
      repo.linhaDoTempo.mockResolvedValue([
        ponto('v1', 'Marina', 9, {
          tipo: 'VENDA',
          atendimentoId: null,
          etapa: null,
        }),
      ]);

      const r = await uc.execute();

      expect(r.faixas[0].atendimentos).toBe(0);
      expect(r.faixas[0].pontos).toHaveLength(1);
    });

    it('faixa vazia tem as seis etapas zeradas, e nao um objeto pela metade', async () => {
      const r = await uc.execute();

      expect(r.faixas[0].porEtapa).toEqual({
        PRIMEIRO_CONTATO: 0,
        EM_NEGOCIACAO: 0,
        REMARCADO: 0,
        SEM_CONTATO: 0,
        CONCLUIDO: 0,
        NAO_AVANCOU: 0,
      });
    });

    /**
     * O TOTAL DA LEGENDA TEM DE BATER COM A SOMA DAS BARRINHAS. E o unico
     * jeito de a tela poder ser lida nos dois sentidos: da loja para a pessoa,
     * e da pessoa para a loja.
     */
    it('o total da loja e a soma das faixas', async () => {
      vendedoras.listar.mockResolvedValue([
        { id: 'v1', nome: 'Marina' },
        { id: 'v2', nome: 'Bianca' },
      ]);
      repo.linhaDoTempo.mockResolvedValue([
        ponto('v1', 'Marina', 9, { atendimentoId: 'at-1', etapa: 'CONCLUIDO' }),
        ponto('v1', 'Marina', 10, { atendimentoId: 'at-1', etapa: 'CONCLUIDO' }),
        ponto('v2', 'Bianca', 11, {
          atendimentoId: 'at-2',
          etapa: 'EM_NEGOCIACAO',
        }),
      ]);

      const r = await uc.execute();

      expect(r.atendimentos).toBe(2);
      expect(r.porEtapa.CONCLUIDO).toBe(1);
      expect(r.porEtapa.EM_NEGOCIACAO).toBe(1);
      expect(r.faixas.reduce((n, f) => n + f.atendimentos, 0)).toBe(
        r.atendimentos,
      );
    });
  });

  // ==========================================================================
  // A ETIQUETA DE GENTE DA CASA — RF29 e RF30, 20/10/2026.
  //
  // Medido na base no mesmo dia: 53 dos 96 RELATOs da timeline sao conversa
  // entre gente de dentro. Sao DOIS caminhos ate a mesma pessoa, e os dois
  // precisam existir — pelo CLIENTE (quem tem ficha) e pelo CHAT (o numero).
  // ==========================================================================
  describe('gente da casa', () => {
    const comMapa = (opcoes: {
      hashes?: string[];
      porHash?: Record<string, string>;
      porChat?: Record<string, string>;
      clientes?: { id: string; telefone1Hash: string }[];
    }) => {
      genteDaCasa.mapa.mockResolvedValue({
        vazio: () => false,
        hashes: () => opcoes.hashes ?? [],
        papelDoHash: (h: string) => opcoes.porHash?.[h] ?? null,
        papelDoChat: (c: string | null) => (c ? (opcoes.porChat?.[c] ?? null) : null),
      });
      clientes.idsComTelefoneEm.mockResolvedValue(opcoes.clientes ?? []);
    };

    it('marca pelo CLIENTE — é por aí que o RELATO entra na timeline', async () => {
      repo.linhaDoTempo.mockResolvedValue([
        ponto('v-1', 'Ana', 9, { clienteId: 'cli-interno' }),
        ponto('v-1', 'Ana', 10, { clienteId: 'cli-de-fora' }),
      ]);
      comMapa({
        hashes: ['h1'],
        porHash: { h1: 'VENDEDORA' },
        clientes: [{ id: 'cli-interno', telefone1Hash: 'h1' }],
      });

      const r = await uc.execute();
      const pontos = r.faixas.flatMap((f) => f.pontos);

      expect(pontos.find((p) => p.clienteId === 'cli-interno')?.interno).toBe(true);
      expect(pontos.find((p) => p.clienteId === 'cli-interno')?.papelInterno).toBe(
        'VENDEDORA',
      );
      expect(pontos.find((p) => p.clienteId === 'cli-de-fora')?.interno).toBe(false);
    });

    it('marca pelo CHAT quando não há cliente nenhum', async () => {
      repo.linhaDoTempo.mockResolvedValue([
        ponto('v-1', 'Ana', 9, { clienteId: null, chatId: '5585999999999@c.us' }),
      ]);
      comMapa({ porChat: { '5585999999999@c.us': 'GERENTE_VENDAS' } });

      const r = await uc.execute();

      expect(r.faixas[0].pontos[0].papelInterno).toBe('GERENTE_VENDAS');
    });

    // UM PONTO PODE TER CLIENTE E NAO TER CHAT (agendamento), OU O CONTRARIO.
    // Olhar so um dos dois deixaria metade passando.
    it('o cliente ganha do chat quando os dois existem', async () => {
      repo.linhaDoTempo.mockResolvedValue([
        ponto('v-1', 'Ana', 9, {
          clienteId: 'cli-interno',
          chatId: '5585999999999@c.us',
        }),
      ]);
      comMapa({
        hashes: ['h1'],
        porHash: { h1: 'ADMIN' },
        porChat: { '5585999999999@c.us': 'VENDEDORA' },
        clientes: [{ id: 'cli-interno', telefone1Hash: 'h1' }],
      });

      const r = await uc.execute();

      expect(r.faixas[0].pontos[0].papelInterno).toBe('ADMIN');
    });

    // ========================================================================
    // E NAO FILTRA NADA. Quem esconde e a tela.
    //
    // Back que some com registro sem ninguem pedir e indistinguivel de back
    // que perdeu registro — e o funil continua contando o que aconteceu.
    // ========================================================================
    it('NÃO esconde o ponto interno, e o funil continua contando', async () => {
      repo.linhaDoTempo.mockResolvedValue([
        ponto('v-1', 'Ana', 9, {
          clienteId: 'cli-interno',
          atendimentoId: 'at-1',
          etapa: 'EM_NEGOCIACAO',
        }),
      ]);
      comMapa({
        hashes: ['h1'],
        porHash: { h1: 'VENDEDORA' },
        clientes: [{ id: 'cli-interno', telefone1Hash: 'h1' }],
      });

      const r = await uc.execute();

      expect(r.faixas[0].pontos).toHaveLength(1);
      expect(r.atendimentos).toBe(1);
      expect(r.porEtapa.EM_NEGOCIACAO).toBe(1);
    });

    it('ninguém com telefone cadastrado: não marca, e não consulta clientes', async () => {
      repo.linhaDoTempo.mockResolvedValue([
        ponto('v-1', 'Ana', 9, { clienteId: 'cli-1' }),
      ]);

      const r = await uc.execute();

      expect(r.faixas[0].pontos[0].interno).toBeUndefined();
      expect(clientes.idsComTelefoneEm).not.toHaveBeenCalled();
    });

    it('`doDia` também marca — é a mesma tela, vista de outro ângulo', async () => {
      repo.linhaDoTempo.mockResolvedValue([
        ponto('v-1', 'Ana', 9, { clienteId: 'cli-interno' }),
        ponto('v-2', 'Bia', 9, { clienteId: 'cli-interno' }),
      ]);
      comMapa({
        hashes: ['h1'],
        porHash: { h1: 'VENDEDORA' },
        clientes: [{ id: 'cli-interno', telefone1Hash: 'h1' }],
      });

      const pontos = await uc.doDia('v-1');

      expect(pontos).toHaveLength(1);
      expect(pontos[0].interno).toBe(true);
    });
  });
});
