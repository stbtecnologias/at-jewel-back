import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { FerramentasVendedoraService } from './ferramentas-vendedora.service';
import { fraseDoFunil, linhasDoFunil } from './etapas-em-palavras';
import type {
  ContagemPorEtapa,
  LinhaResumoVendedora,
} from '../domain/ports/repositories/atendimento-repository.port';

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
  let auditoria: { resumo: jest.Mock };
  let servico: FerramentasVendedoraService;

  beforeEach(() => {
    auditoria = { resumo: jest.fn() };
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

    expect(r).toEqual({ total: 0, linhas: [], aguardandoRelato: 0 });
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
    );
  });

  const montar = () => servico.montar(null);

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
