import { juntarObservacao } from './atualizar-status-lead.use-case';

/**
 * A OBSERVACAO DO LEAD SE SOMA, E NAO SUBSTITUI — 22/09/2026.
 *
 * ==========================================================================
 * O FLUXO REAL QUE MOSTROU O PROBLEMA, no primeiro teste da ferramenta:
 *
 *   10:56  "ja falei com o Aslan, pediu para voltar dia 10"   -> anotado
 *   10:57  "pode dar baixa nesse"
 *          "dou baixa como nao vingou? aconteceu alguma coisa?"
 *          "achou caro"                                        -> o motivo
 *
 * Com substituicao, o motivo apagaria o "voltar dia 10" — que e justamente o
 * que explica a baixa. Quem lesse depois veria a conclusao sem a historia.
 * ==========================================================================
 */
describe('juntarObservacao', () => {
  const DIA = new Date(2026, 8, 22, 10, 57);

  it('a nova se soma a antiga, com a data na frente', () => {
    expect(juntarObservacao('21/09 · pediu para voltar dia 10', 'achou caro', DIA))
      .toBe('21/09 · pediu para voltar dia 10\n22/09 · achou caro');
  });

  it('sem nada antes, e so a linha nova', () => {
    expect(juntarObservacao(null, 'achou caro', DIA)).toBe('22/09 · achou caro');
  });

  /** Ela trocou so o status. O que estava escrito FICA. */
  it('undefined nao mexe em nada', () => {
    expect(juntarObservacao('algo escrito', undefined, DIA)).toBeUndefined();
  });

  /**
   * `null` e vazio APAGAM, e e de proposito: e o unico jeito de desfazer uma
   * anotacao errada. O que nao pode e apagar sem querer — por isso a descricao
   * da ferramenta manda omitir o campo em vez de mandar vazio.
   */
  it('null e vazio apagam o historico', () => {
    expect(juntarObservacao('algo escrito', null, DIA)).toBeNull();
    expect(juntarObservacao('algo escrito', '   ', DIA)).toBeNull();
  });

  it('espaco sobrando nao vira linha em branco', () => {
    expect(juntarObservacao('  anterior  ', '  achou caro  ', DIA))
      .toBe('anterior\n22/09 · achou caro');
  });

  /**
   * O TETO CORTA O COMECO, e nao o fim: o que acabou de acontecer vale mais
   * que o primeiro contato — e o "[...]" avisa que houve corte, para ninguem
   * ler aquilo como a historia inteira.
   */
  it('estourando o teto, corta o comeco e avisa', () => {
    const gigante = 'x'.repeat(2100);

    const r = juntarObservacao(gigante, 'achou caro', DIA);

    expect(r).toMatch(/^\[\.\.\.\]\n/);
    expect(r).toContain('22/09 · achou caro');
    expect(r!.length).toBeLessThanOrEqual(2000 + '[...]\n'.length);
  });

  it('o dia vem com dois digitos', () => {
    expect(juntarObservacao(null, 'nota', new Date(2026, 0, 5)))
      .toBe('05/01 · nota');
  });
});
