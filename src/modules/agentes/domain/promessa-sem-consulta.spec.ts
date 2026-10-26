import { ehPromessaSemDado } from './promessa-sem-consulta';

/**
 * A PROMESSA QUE ENCERRA O TURNO — 26/10/2026.
 *
 * ==========================================================================
 * As duas frases que ele recebeu em produção, e depois teve de perguntar
 * "cadê?" para ver o dado:
 *
 *   "Vou olhar o faturamento por empresa deste ano."
 *   "Faturamento por empresa em 2026:"
 * ==========================================================================
 *
 * A metade de baixo deste arquivo é a que importa mais: cada frase que isto
 * marcar por engano custa uma ida a mais ao modelo e uma resposta que demora.
 */
describe('ehPromessaSemDado', () => {
  it('as duas frases de produção', () => {
    expect(ehPromessaSemDado('Vou olhar o faturamento por empresa deste ano.')).toBe(
      true,
    );
    expect(ehPromessaSemDado('Faturamento por empresa em 2026:')).toBe(true);
  });

  it('as outras formas de prometer', () => {
    expect(ehPromessaSemDado('Já vou buscar as vendas dela.')).toBe(true);
    expect(ehPromessaSemDado('Deixa eu ver a agenda de amanhã')).toBe(true);
    expect(ehPromessaSemDado('Vou consultar e já te digo')).toBe(true);
  });

  /* PERGUNTA NÃO É PROMESSA: é a coisa certa a fazer quando falta recorte, e
   * cobrar dado aqui atropelaria a única resposta correta. */
  it('pergunta não é promessa, mesmo começando com "vou"', () => {
    expect(
      ehPromessaSemDado('Vou precisar do nome: de qual vendedora você quer?'),
    ).toBe(false);
    expect(
      ehPromessaSemDado('Você quer o faturamento da filial ou as vendas uma a uma?'),
    ).toBe(false);
  });

  it('resposta com dado não é promessa', () => {
    expect(
      ehPromessaSemDado(
        'A filial de SP faturou R$ 925.955 em 6 vendas este ano, ticket médio de R$ 154.326.',
      ),
    ).toBe(false);
    expect(ehPromessaSemDado('Nenhuma venda nesse período.')).toBe(false);
  });

  /* Acima do teto a resposta já tem a lista dentro — e foi assim que a mesma
   * pergunta voltou certa depois do "cadê?". */
  it('texto longo não é promessa, mesmo abrindo com dois-pontos no fim de linha', () => {
    const comLista =
      'Faturamento por empresa em 2026: ' +
      '1. AT JEWEL LTDA — R$ 15.714.173, 260 vendas. ' +
      '2. AT JEWEL LTDA - SP — R$ 925.955, 6 vendas. ' +
      '3. AT DESING DE PRODUTOS LTDA — R$ 77.700, 28 vendas.';

    expect(comLista.length).toBeGreaterThan(160);
    expect(ehPromessaSemDado(comLista)).toBe(false);
  });

  it('vazio não é nada', () => {
    expect(ehPromessaSemDado('')).toBe(false);
    expect(ehPromessaSemDado('   ')).toBe(false);
  });
});
