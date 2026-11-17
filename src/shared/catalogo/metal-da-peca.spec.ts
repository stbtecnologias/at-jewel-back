import { metalDaCor, metalDaEtiqueta, METAIS } from './sinonimos';

/**
 * O METAL DA PECA, PELO DICIONARIO QUE JA EXISTIA — 16/11/2026.
 *
 * ==========================================================================
 * A PRIMEIRA VERSAO DO PLANO REESCREVIA ISTO DO ZERO.
 *
 * Com expressao regular propria (`/^(OB|OA|OR|ON)(\s|$)/`) e um mapa novo de
 * siglas. O Lucas apontou: "a descricao das pecas tem a cor e a pedra... voce
 * ja fez uma por pedra, agora e por cor".
 *
 * O `SINONIMOS` ja sabia as cinco siglas desde 08/10 (RF7), e o
 * `pedrasDaEtiqueta` ja varria a etiqueta desde 29/10. Faltava so o conjunto
 * `METAIS`, espelhando o `PEDRAS`.
 * ==========================================================================
 */
describe('metalDaCor', () => {
  it('as cinco siglas que o dicionario conhece', () => {
    expect(metalDaCor('OB 18K')).toBe('ouro branco');
    expect(metalDaCor('OA 18K')).toBe('ouro amarelo');
    expect(metalDaCor('OR 18K')).toBe('ouro rose');
    expect(metalDaCor('ON 18K')).toBe('ouro negro');
    expect(metalDaCor('PT')).toBe('platina');
  });

  it('o quilate nao separa: 14K cai no mesmo metal que 18K', () => {
    expect(metalDaCor('OB 14K')).toBe('ouro branco');
    expect(metalDaCor('OA 14K')).toBe('ouro amarelo');
  });

  it('caixa e espaco do cadastro nao mudam o metal', () => {
    expect(metalDaCor('  ob 18k ')).toBe('ouro branco');
  });

  // A ARMADILHA: 19 pecas de AT WEAR — corset e saia — tem cor 'ONCA'.
  it('ONCA nao e ouro negro', () => {
    expect(metalDaCor('ONÇA')).toBeNull();
    expect(metalDaCor('ONCA')).toBeNull();
  });

  it('cor de verdade, vazio e nulo nao viram metal', () => {
    expect(metalDaCor('Verde')).toBeNull();
    expect(metalDaCor('JAC.PRETO')).toBeNull();
    expect(metalDaCor('MARMORE')).toBeNull();
    expect(metalDaCor(null)).toBeNull();
    expect(metalDaCor(undefined)).toBeNull();
    expect(metalDaCor('   ')).toBeNull();
  });

  // O DICIONARIO MISTURA TUDO: sem o conjunto METAIS, 'CTS' viraria "quilate"
  // e 'DMT' viraria "diamante". E o mesmo defeito que o teste pegou no PEDRAS.
  it('palavra do dicionario que nao e metal nao passa', () => {
    expect(metalDaCor('CTS')).toBeNull();
    expect(metalDaCor('DMT')).toBeNull();
    expect(metalDaCor('ESM')).toBeNull();
  });

  it('so le a PRIMEIRA palavra, que e onde a sigla mora', () => {
    // '18K OB' nao existe no cadastro, e se existisse nao seria lido — o
    // formato da casa e sigla primeiro, teor depois.
    expect(metalDaCor('18K OB')).toBeNull();
  });
});

describe('metalDaEtiqueta', () => {
  it('acha o metal no meio da etiqueta', () => {
    expect(metalDaEtiqueta('ANEL 50PTS DTS 2.50 CTS OB 18K')).toBe('ouro branco');
  });

  it('espaco dobrado nao esconde a sigla', () => {
    expect(metalDaEtiqueta('BRINCO G DIAMANTE OA  22.0G DTS 4.90 CTS')).toBe(
      'ouro amarelo',
    );
  });

  // 'PTS' E PONTOS DE DIAMANTE e contem 'PT'. Varrer por pedaco em vez de por
  // palavra inteira transformaria meia etiqueta da casa em platina.
  it('PTS nao e platina', () => {
    expect(metalDaEtiqueta('ANEL 50PTS DTS 2.50 CTS')).toBeNull();
  });

  it('etiqueta sem metal nenhum', () => {
    expect(metalDaEtiqueta('COLAR DTS 4.88 CTS 3.0G 14K')).toBeNull();
    expect(metalDaEtiqueta('ANEL RUBELITA')).toBeNull();
    expect(metalDaEtiqueta(null)).toBeNull();
    expect(metalDaEtiqueta('')).toBeNull();
  });
});

describe('METAIS', () => {
  it('tem os cinco metais, e nenhuma pedra', () => {
    expect([...METAIS].sort()).toEqual([
      'ouro amarelo',
      'ouro branco',
      'ouro negro',
      'ouro rose',
      'platina',
    ]);
  });
});
