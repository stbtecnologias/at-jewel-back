import { modeloDeIa } from './modelo-de-ia';

/**
 * A VARIAVEL EM BRANCO — 29/09/2026.
 *
 * ==========================================================================
 * ESTE TESTE GUARDA UM DEFEITO QUE CUSTOU VINTE DIAS SEM NINGUEM VER.
 *
 * O leitor de conversas nasceu em 09/09 com `config.get('X') ?? 'padrao'`. O
 * `.env` local tinha a chave declarada e VAZIA, o `??` nao cobre string vazia,
 * e a API respondia `400 model: String should have at least 1 character`.
 *
 * Nao doeu porque o caminho nunca era exercitado. No primeiro teste com
 * trafego real, falhou na primeira tentativa.
 * ==========================================================================
 */
describe('modeloDeIa', () => {
  const comValor = (v: unknown) => ({ get: <T,>(): T => v as T });

  it('usa o que esta configurado', () => {
    expect(modeloDeIa(comValor('claude-opus-5'), 'X', 'padrao')).toBe('claude-opus-5');
  });

  /* O caso que o `??` NAO cobria, e que e o motivo deste arquivo existir. */
  it('chave VAZIA cai no padrao — e nao vai vazia para a API', () => {
    expect(modeloDeIa(comValor(''), 'X', 'padrao')).toBe('padrao');
  });

  it('chave so com espaco tambem cai no padrao', () => {
    expect(modeloDeIa(comValor('   '), 'X', 'padrao')).toBe('padrao');
  });

  it.each([undefined, null])('chave ausente (%s) cai no padrao', (v) => {
    expect(modeloDeIa(comValor(v), 'X', 'padrao')).toBe('padrao');
  });

  it('espaco em volta do valor nao viaja para a API', () => {
    expect(modeloDeIa(comValor('  claude-sonnet-5  '), 'X', 'padrao'))
      .toBe('claude-sonnet-5');
  });

  it('o resultado NUNCA e string vazia', () => {
    for (const entrada of ['', '  ', undefined, null, '\t\n']) {
      expect(modeloDeIa(comValor(entrada), 'X', 'padrao')).not.toBe('');
    }
  });
});
