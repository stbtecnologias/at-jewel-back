import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { FerramentasVendedoraService } from './ferramentas-vendedora.service';
import { fraseDoFunil, linhasDoFunil } from './etapas-em-palavras';
import type {
  ContagemPorEtapa,
  LinhaResumoVendedora,
} from '../domain/ports/repositories/atendimento-repository.port';

/**
 * A Conexa nestes testes nunca tem a foto — e o caso comum: das 320 joias
 * com saldo, 55 tem foto. Quem testa roteamento nao testa imagem.
 */
const SEM_FOTOS = {
  buscar: async () => ({ fotos: [], tinhamUrl: 0, cortadas: 0 }),
} as never;

/**
 * O FUNIL PELAS DUAS AGENTES — 21/09/2026.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE: A VENDEDORA NAO ALCANCA A CARTEIRA DE NINGUEM.
 *
 * Decisao do Lucas: "cada vendedora ve apenas as suas coisas. Nada de ver a de
 * outra. Apenas gestao ve tudo". No canal dela isso nao e regra de prompt — e
 * ausencia de caminho: a ferramenta NAO TEM parametro de pessoa, e o
 * `vendedoraId` vai no filtro da consulta.
 *
 * Os dois testes que guardam isso sao o da aridade (a funcao nao aceita
 * argumento) e o do filtro (o SQL ja volta recortado). Se alguem um dia
 * acrescentar um `vendedora?` opcional aqui, o primeiro quebra.
 * ==========================================================================
 */

const ZERO: ContagemPorEtapa = {
  PRIMEIRO_CONTATO: 0,
  EM_NEGOCIACAO: 0,
  REMARCADO: 0,
  SEM_CONTATO: 0,
  CONCLUIDO: 0,
  NAO_AVANCOU: 0,
};

const etapas = (p: Partial<ContagemPorEtapa>): ContagemPorEtapa => ({
  ...ZERO,
  ...p,
});

function linha(
  nome: string,
  id: string,
  p: Partial<ContagemPorEtapa>,
  aguardando = 0,
): LinhaResumoVendedora {
  const porEtapa = etapas(p);
  const total = Object.values(porEtapa).reduce((s, n) => s + n, 0);
  return {
    vendedoraId: id,
    nome,
    total,
    porEtapa,
    aguardandoRelato: aguardando,
    ultimaAtividadeEm: null,
  };
}

describe('as etapas em palavras', () => {
  it('etapa zerada nao vira linha', () => {
    expect(linhasDoFunil(etapas({ EM_NEGOCIACAO: 5 }))).toEqual([
      '5 em negociacao',
    ]);
  });

  it('concorda no singular e no plural', () => {
    expect(
      linhasDoFunil(etapas({ REMARCADO: 1, SEM_CONTATO: 3 })),
    ).toEqual(['1 remarcado', '3 sem conseguir falar']);
  });

  it('CONCLUIDO e NAO_AVANCOU ficam de fora — sao o desfecho', () => {
    expect(linhasDoFunil(etapas({ CONCLUIDO: 9, NAO_AVANCOU: 4 }))).toEqual([]);
  });

  it('a frase liga o ultimo item com "e", e nao com virgula', () => {
    expect(
      fraseDoFunil(8, etapas({ EM_NEGOCIACAO: 5, REMARCADO: 2, SEM_CONTATO: 1 })),
    ).toBe(
      '8 clientes em atendimento aberto: 5 em negociacao, 2 remarcados e 1 sem conseguir falar',
    );
  });

  it('carteira vazia nao vira "0 clientes"', () => {
    expect(fraseDoFunil(0, ZERO)).toBe('nenhum cliente em atendimento aberto');
  });
});

describe('a carteira da vendedora (Elena)', () => {
  let auditoria: { resumo: jest.Mock; listar: jest.Mock };
  let servico: FerramentasVendedoraService;

  beforeEach(() => {
    // O `listar` entrou em 08/10: o resumo dá a distribuição por etapa, a
    // lista dá os NOMES. Ver o comentário em `consultarCarteiraAgora`.
    auditoria = {
      resumo: jest.fn(),
      listar: jest.fn().mockResolvedValue({ itens: [], total: 0 }),
    };
    servico = new FerramentasVendedoraService(
      { execute: jest.fn() } as never,
      { vendas: jest.fn(), metas: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { execute: jest.fn() } as never,
      auditoria as never,
      { listarPorVendedora: jest.fn().mockResolvedValue([]) } as never,
      { execute: jest.fn() } as never,
    );
  });

  const montar = () =>
    servico.montar({ vendedoraId: 'vd-1', codigoErp: 'SEED-VD01' });

  it('NAO ACEITA "de quem" — a ferramenta nao tem parametro', () => {
    // A aridade e a garantia mecanica do escopo: sem argumento nao ha campo
    // para o modelo preencher com o nome de uma colega.
    expect(montar().consultarCarteiraAgora.length).toBe(0);
  });

  it('consulta so os abertos DELA, pelo id que veio por closure', async () => {
    auditoria.resumo.mockResolvedValue({
      total: 8,
      porEtapa: etapas({ EM_NEGOCIACAO: 5 }),
      vendedoras: [linha('Marina', 'vd-1', { EM_NEGOCIACAO: 5, REMARCADO: 3 }, 2)],
    });

    const r = await montar().consultarCarteiraAgora();

    expect(auditoria.resumo).toHaveBeenCalledWith({
      apenasAbertos: true,
      vendedoraId: 'vd-1',
    });
    expect(r.total).toBe(8);
    expect(r.linhas).toEqual(['5 em negociacao', '3 remarcados']);
    expect(r.aguardandoRelato).toBe(2);
  });

  it('sem cliente em curso devolve zero, e nao uma lista vazia mentirosa', async () => {
    auditoria.resumo.mockResolvedValue({
      total: 0,
      porEtapa: ZERO,
      vendedoras: [],
    });

    const r = await montar().consultarCarteiraAgora();

    expect(r).toEqual({
      total: 0,
      linhas: [],
      aguardandoRelato: 0,
      clientes: [],
    });
  });

  /**
   * ========================================================================
   * QUEM SÃO, E NÃO SÓ QUANTOS — 08/10/2026, de um teste em PRODUÇÃO.
   *
   * Conversa da Nathalia com a Helena, 11:21:
   *
   *   — "Quem são as clientes em negociação?"
   *   — "Aqui o sistema só me dá o número — são 5 clientes em negociação,
   *      mas sem os nomes. (...) o melhor caminho é você olhar direto no
   *      seu funil de atendimento."
   *
   * A agente estava CERTA sobre a ferramenta — ela só chamava o `resumo`,
   * que é agregado. Mas o dado estava a um método de distância, e o custo
   * não aparecia como erro: a própria agente acabara de dizer que aqueles
   * cinco eram "o foco mais imediato", e a conversa terminou mandando a
   * vendedora para outra tela.
   * ========================================================================
   */
  describe('quem são os clientes em curso', () => {
    const emCurso = (nome: string, etapa = 'EM_NEGOCIACAO') => ({
      clienteNome: nome,
      etapa,
      abertoEm: new Date('2026-10-03T10:00:00-03:00'),
      aguardandoRelato: false,
      proximoContatoEm: null,
    });

    /* ESTE É O TESTE. O resto é contorno. */
    it('devolve os nomes, com a etapa e desde quando', async () => {
      auditoria.resumo.mockResolvedValue({
        total: 2,
        porEtapa: etapas({ EM_NEGOCIACAO: 2 }),
        vendedoras: [linha('Marina', 'vd-1', { EM_NEGOCIACAO: 2 }, 0)],
      });
      auditoria.listar.mockResolvedValue({
        itens: [emCurso('Carla Oliveira'), emCurso('Ana Beatriz')],
        total: 2,
      });

      const r = await montar().consultarCarteiraAgora();

      // `rotuloEtapa` escreve sem acento, e é o MESMO rótulo das linhas do
      // funil — reaproveitado de propósito: dois formatadores divergiriam, e
      // "em negociacao" numa linha e "em negociação" na outra confundiria
      // quem lê as duas juntas.
      expect(r.clientes).toEqual([
        'Carla Oliveira (em negociacao, desde 03/10)',
        'Ana Beatriz (em negociacao, desde 03/10)',
      ]);
      expect(r.clientesOcultos).toBeUndefined();
    });

    /** E A LISTA É DELA: o `vendedoraId` vem por closure, como no resumo. */
    it('lista só os abertos DELA, e só até o teto', async () => {
      auditoria.resumo.mockResolvedValue({
        total: 1,
        porEtapa: etapas({ EM_NEGOCIACAO: 1 }),
        vendedoras: [linha('Marina', 'vd-1', { EM_NEGOCIACAO: 1 }, 0)],
      });

      await montar().consultarCarteiraAgora();

      expect(auditoria.listar).toHaveBeenCalledWith({
        apenasAbertos: true,
        vendedoraId: 'vd-1',
        limit: 15,
      });
    });

    /**
     * O TETO SE ANUNCIA. Quinze de trinta parecem os trinta, e aí ela trata
     * metade da carteira achando que viu tudo.
     */
    it('carteira maior que o teto diz quantos ficaram de fora', async () => {
      auditoria.resumo.mockResolvedValue({
        total: 30,
        porEtapa: etapas({ EM_NEGOCIACAO: 30 }),
        vendedoras: [linha('Marina', 'vd-1', { EM_NEGOCIACAO: 30 }, 0)],
      });
      auditoria.listar.mockResolvedValue({
        itens: Array.from({ length: 15 }, (_, i) => emCurso(`Cliente ${i}`)),
        total: 30,
      });

      const r = await montar().consultarCarteiraAgora();

      expect(r.clientes).toHaveLength(15);
      expect(r.clientesOcultos).toBe(15);
    });

    /**
     * ESPERANDO O RELATO DELA é o que muda o dia: é a diferença entre um
     * cliente que está andando e um parado por causa dela.
     */
    it('marca com destaque quem espera o relato dela', async () => {
      auditoria.resumo.mockResolvedValue({
        total: 1,
        porEtapa: etapas({ EM_NEGOCIACAO: 1 }),
        vendedoras: [linha('Marina', 'vd-1', { EM_NEGOCIACAO: 1 }, 1)],
      });
      auditoria.listar.mockResolvedValue({
        itens: [{ ...emCurso('Carla Oliveira'), aguardandoRelato: true }],
        total: 1,
      });

      const r = await montar().consultarCarteiraAgora();

      expect(r.clientes[0]).toContain('ESPERANDO SEU RELATO');
    });

    it('contato já marcado aparece na linha', async () => {
      auditoria.resumo.mockResolvedValue({
        total: 1,
        porEtapa: etapas({ REMARCADO: 1 }),
        vendedoras: [linha('Marina', 'vd-1', { REMARCADO: 1 }, 0)],
      });
      auditoria.listar.mockResolvedValue({
        itens: [
          {
            ...emCurso('Carla Oliveira', 'REMARCADO'),
            proximoContatoEm: new Date('2026-10-14T15:00:00-03:00'),
          },
        ],
        total: 1,
      });

      const r = await montar().consultarCarteiraAgora();

      expect(r.clientes[0]).toContain('contato marcado para 14/10');
    });
  });
});

describe('o funil pela gestao (Anastasia)', () => {
  let resolverVendedora: { execute: jest.Mock };
  let auditoria: { listar: jest.Mock; detalhe: jest.Mock; resumo: jest.Mock };
  let servico: FerramentasGestaoService;

  const MARINA = {
    status: 'ACHOU',
    id: 'vd-1',
    nome: 'Marina Albuquerque',
    codigoErp: 'SEED-VD01',
  };

  beforeEach(() => {
    resolverVendedora = { execute: jest.fn().mockResolvedValue(MARINA) };
    auditoria = {
      listar: jest.fn(),
      detalhe: jest.fn(),
      resumo: jest.fn(),
    };
    servico = new FerramentasGestaoService(
      resolverVendedora as never,
      // Metricas de atendimento (ANA-08 a 12, 29/09) — dubladas.
      { execute: jest.fn().mockResolvedValue({
        de: new Date(), ate: new Date(),
        leadsPorVendedora: [], interacoesPorVendedora: [],
        primeiraResposta: { minutos: null, amostra: 0, minimo: null, maximo: null },
        duracaoDoAtendimento: { minutos: null, amostra: 0, minimo: null, maximo: null },
        ateFecharVenda: { minutos: null, amostra: 0, minimo: null, maximo: null },
      }) } as never,
      // Rankings (ANA-14, 29/09) — dublados.
      { execute: jest.fn().mockResolvedValue({
        de: new Date(), ate: new Date(),
        respondeMaisRapido: [], fechaMaisRapido: [], maisInterage: [],
        maisConverte: [], maisLeads: [], semAmostra: [],
      }) } as never,
      // Análise de tom (ANA-15, 29/09) — dublada.
      { execute: jest.fn().mockResolvedValue({ status: 'SEM_CONVERSA' }) } as never,
      // Comparação ano a ano (29/09) — dublada.
      { porMes: jest.fn().mockResolvedValue({ rotulo: "x", cortadoNoDia: null, anos: [] }),
        porPeriodo: jest.fn().mockResolvedValue({ rotulo: "x", cortadoNoDia: null, anos: [] }) } as never,
      // Comparação com o período anterior (29/09) — dublada.
      { porRecorte: jest.fn().mockResolvedValue({ rotulo: "x", atual: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anterior: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anteriorFechado: null }),
        porDatas: jest.fn().mockResolvedValue({ rotulo: "x", atual: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anterior: { clientes: 0, vendas: 0, receita: 0, ticketMedio: 0, de: new Date(), ate: new Date() }, anteriorFechado: null }) } as never,
      // ConexoesService e WahaAdminClient (29/09) — dublados. O `catch`
      // do handler faz a lista sair mesmo sem WAHA, e e isso que o
      // `mockRejectedValue` exercita nos testes que nao ligam para conexao.
      { vendedoraDaSessao: (s: string) => s.replace(/^vend-/, "") } as never,
      { listarSessoes: jest.fn().mockResolvedValue([]) } as never,
      // A consulta de venda, que desde 25/09 le a MOVIMENTACAO. Dublada aqui:
      // estes testes descrevem o roteamento das ferramentas, nao o SQL.
      { itens: jest.fn().mockResolvedValue({ linhas: [] }) } as never,
      // A consulta de catalogo da GESTAO, com quantidade — dublada.
      { execute: jest.fn().mockResolvedValue([]) } as never,
      SEM_FOTOS,
      { execute: jest.fn() } as never,
      { vendas: jest.fn(), metas: jest.fn() } as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      { execute: jest.fn() } as never,
      auditoria as never,
      { doDia: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), buscarPorId: jest.fn() } as never,
      { buscarPorNomeParcial: jest.fn() } as never,
      { listarAguardandoGestao: jest.fn() } as never,
      // O ponteiro de conversas vivas (29/09) — dublado: estes testes
      // descrevem o roteamento das ferramentas, nao a consulta.
      { entre: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  const montar = () => servico.montar();

  it('sem nome, traz a loja e uma linha por vendedora, da maior para a menor', async () => {
    auditoria.resumo.mockResolvedValue({
      total: 14,
      porEtapa: etapas({ EM_NEGOCIACAO: 9, REMARCADO: 5 }),
      vendedoras: [
        linha('Beatriz', 'vd-2', { EM_NEGOCIACAO: 4 }, 1),
        linha('Marina', 'vd-1', { EM_NEGOCIACAO: 5, REMARCADO: 5 }, 3),
      ],
    });

    const r = await montar().gestaoFunil({});

    // Sem `vendedoraId`: a loja inteira.
    expect(auditoria.resumo).toHaveBeenCalledWith({ apenasAbertos: true });
    expect(r.status).toBe('OK');
    expect(r.linhas[0]).toBe(
      'A loja tem 14 clientes em atendimento aberto: 9 em negociacao e 5 remarcados.',
    );
    expect(r.linhas[1]).toBe('4 deles estao esperando o relato da vendedora');
    // Marina tem 10 e a Beatriz 4 — a maior primeiro.
    expect(r.linhas[2]).toContain('Marina');
    expect(r.linhas[2]).toContain('3 esperando relato');
    expect(r.linhas[3]).toContain('Beatriz');
  });

  it('com nome, recorta no SQL pela vendedora resolvida', async () => {
    auditoria.resumo.mockResolvedValue({
      total: 10,
      porEtapa: etapas({ EM_NEGOCIACAO: 10 }),
      vendedoras: [linha('Marina', 'vd-1', { EM_NEGOCIACAO: 10 }, 0)],
    });

    const r = await montar().gestaoFunil({ vendedora: 'marina' });

    expect(auditoria.resumo).toHaveBeenCalledWith({
      apenasAbertos: true,
      vendedoraId: 'vd-1',
    });
    expect(r.status).toBe('OK');
    expect(r.vendedora).toBe('Marina Albuquerque');
    expect(r.linhas).toEqual([
      '10 clientes em atendimento aberto: 10 em negociacao',
    ]);
  });

  it('nome ambiguo nao consulta nada e devolve os nomes', async () => {
    resolverVendedora.execute.mockResolvedValue({
      status: 'AMBIGUA',
      nomes: ['Marina Albuquerque', 'Marina Prado'],
    });

    const r = await montar().gestaoFunil({ vendedora: 'marina' });

    expect(auditoria.resumo).not.toHaveBeenCalled();
    expect(r.status).toBe('AMBIGUA');
    expect(r.nomes).toEqual(['Marina Albuquerque', 'Marina Prado']);
  });

  it('loja sem nenhum atendimento aberto devolve lista vazia', async () => {
    auditoria.resumo.mockResolvedValue({
      total: 0,
      porEtapa: ZERO,
      vendedoras: [],
    });

    const r = await montar().gestaoFunil({});

    expect(r).toEqual({ status: 'OK', linhas: [] });
  });
});
