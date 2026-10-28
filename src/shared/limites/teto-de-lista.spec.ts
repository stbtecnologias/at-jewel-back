import { TETO_DE_LISTA } from './teto-de-lista';

/**
 * ==========================================================================
 * O TETO TEM DE CABER A MAIOR LISTA DA CASA — 28/10/2026.
 *
 * *"Tem que subir para caber até a maior lista que ela pedir."* — Lucas.
 *
 * Este arquivo existe para o teto não voltar a morder em silêncio. Em 27/10
 * ele era 500, e as vendas da AT JEWEL LTDA desde 2023 são 1.110: o PDF saía
 * com 500 e o documento dizia "Exibindo 500 de 1.110" — honesto, e ainda
 * assim 610 vendas de fora.
 *
 * Os números abaixo foram MEDIDOS no banco em 28/10. Quando a base crescer e
 * passar deles, é este teste que cai — e é o aviso certo, porque ele cai no
 * `npm test` e não na frente da gestora.
 * ==========================================================================
 */

/** A maior lista que cada consulta da casa pode devolver, medida em 28/10/2026. */
const MAIORES_LISTAS = {
  'produtos (o catálogo inteiro)': 7423,
  'itens de movimentação': 2383,
  'vendas (todas as saídas, sempre)': 1412,
  'clientes ativos': 1112,
  'a maior empresa': 1110,
  'produtos com saldo': 587,
  leads: 531,
  'a maior vendedora': 422,
  'a maior carteira': 156,
};

describe('TETO_DE_LISTA', () => {
  /* ESTE É O TESTE. */
  it('cabe TODA lista que a casa sabe produzir', () => {
    for (const [lista, tamanho] of Object.entries(MAIORES_LISTAS)) {
      expect({ lista, cabe: tamanho <= TETO_DE_LISTA }).toEqual({
        lista,
        cabe: true,
      });
    }
  });

  it('e sobra folga para o crescimento — pelo menos o dobro da maior', () => {
    // Teto que cabe a maior de hoje por um fio volta a morder no mês que vem,
    // e o próximo a descobrir é quem lê o PDF.
    const maior = Math.max(...Object.values(MAIORES_LISTAS));
    expect(TETO_DE_LISTA).toBeGreaterThanOrEqual(maior * 2);
  });

  it('continua sendo um NÚMERO, e não o infinito', () => {
    // Consulta sem teto é o caminho para uma query acidental trazer a base
    // inteira para a memória. O teto medido do PDF é de 19s em 20.000 linhas;
    // ordens de grandeza acima disso deixam de ser "um listão" e passam a ser
    // um travamento.
    expect(Number.isFinite(TETO_DE_LISTA)).toBe(true);
    expect(TETO_DE_LISTA).toBeLessThanOrEqual(100_000);
  });
});
