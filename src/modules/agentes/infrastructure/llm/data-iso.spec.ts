import { DATA_ISO } from './anthropic.client';

/**
 * O REGEX QUE NAO CASAVA COM NADA — 29/09/2026.
 *
 * ==========================================================================
 * ESTE TESTE EXISTE POR UM DEFEITO QUE NAO DAVA ERRO EM LUGAR NENHUM.
 *
 * O teste da data era `/^d{4}-d{2}-d{2}$/` — sem as barras do `\d`. Isso
 * compila, passa no `tsc`, nao lanca excecao, e casa com o texto literal
 * "dddd-dd-dd": nenhuma data real passa. O efeito era a data ser DESCARTADA
 * EM SILENCIO e o handler cair no padrao, que e hoje.
 *
 * Perguntar "como foi o dia da Aline no dia 25?" devolvia os numeros de hoje,
 * com cara de resposta certa. Um regex que rejeita tudo e indistinguivel de um
 * regex que funciona quando so se testa a rejeicao — por isso o primeiro teste
 * aqui e o de ACEITAR.
 * ==========================================================================
 */
describe('a data que o modelo manda', () => {
  it('ACEITA uma data de verdade — o teste que faltava', () => {
    expect(DATA_ISO.test('2026-09-25')).toBe(true);
    expect(DATA_ISO.test('2026-01-01')).toBe(true);
  });

  it('recusa o que nao e data, para o handler cair no padrao', () => {
    for (const lixo of ['hoje', '25/09/2026', '', '2026-9-5', 'dddd-dd-dd']) {
      expect(DATA_ISO.test(lixo)).toBe(false);
    }
  });

  /*
   * O `$` ancora o fim, e sem ele "2026-09-25; DROP" passaria. A data vai
   * para uma consulta parametrizada, entao nao havia injecao — mas o valor
   * chegaria sujo ao banco e o erro sairia como "nao consegui consultar".
   */
  it('nao aceita sobra depois da data', () => {
    expect(DATA_ISO.test('2026-09-25 00:00')).toBe(false);
    expect(DATA_ISO.test('x2026-09-25')).toBe(false);
  });
});
