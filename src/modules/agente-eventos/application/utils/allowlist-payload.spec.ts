import {
  CHAVES_PAYLOAD_PERMITIDAS,
  chavesForaDaAllowlist,
} from './allowlist-payload';

describe('chavesForaDaAllowlist', () => {
  it('retorna vazio para payload nulo ou indefinido', () => {
    expect(chavesForaDaAllowlist(null)).toEqual([]);
    expect(chavesForaDaAllowlist(undefined)).toEqual([]);
  });

  it('aceita payload so com chaves permitidas', () => {
    const payload = {
      estado: 'READY_FOR_ROUTING',
      vendedoraSugerida: 'V-007',
      score: 0.91,
      correlationId: 'corr-1',
      duracaoMs: 12,
    };
    expect(chavesForaDaAllowlist(payload)).toEqual([]);
  });

  it('reporta apenas as chaves de topo desconhecidas', () => {
    const payload = {
      estado: 'OK',
      foo: 1,
      bar: 2,
    };
    expect(chavesForaDaAllowlist(payload)).toEqual(['foo', 'bar']);
  });

  it('so inspeciona o nivel de topo (nao desce em objetos aninhados)', () => {
    // chave de topo 'motivo' e permitida; chave aninhada desconhecida nao
    // e responsabilidade desta camada (a varredura de PII cobre o interior).
    const payload = { motivo: { chaveInternaQualquer: 'x' } };
    expect(chavesForaDaAllowlist(payload)).toEqual([]);
  });

  it('rejeita payload que nao e objeto sem ecoar conteudo', () => {
    expect(chavesForaDaAllowlist(['a', 'b'])).toEqual(['<payload-nao-e-objeto>']);
    expect(chavesForaDaAllowlist('texto')).toEqual(['<payload-nao-e-objeto>']);
    expect(chavesForaDaAllowlist(42)).toEqual(['<payload-nao-e-objeto>']);
  });

  it('a allowlist cobre as chaves de metadados previstas', () => {
    for (const chave of [
      'estado',
      'suspeitaInjection',
      'camposColetados',
      'vendedoraSugerida',
      'vendedoraAprovada',
      'motivo',
      'score',
      'correlationId',
      'duracaoMs',
      'slaTipo',
      'totalSugestoes',
    ]) {
      expect(CHAVES_PAYLOAD_PERMITIDAS.has(chave)).toBe(true);
    }
  });
});
