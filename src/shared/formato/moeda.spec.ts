import { moeda } from './moeda';

/**
 * ==========================================================================
 * O VALOR QUE CHEGA A QUEM LÊ É O EXATO — 28/10/2026.
 *
 * *"Se a função moeda() está arredondando, tem que ajustar antes de mostrar
 * na tela do Whats ou PDF para o cliente."* — Lucas, 27/10/2026.
 *
 * Isto REVERTE a decisão de 22/10 (*"a conversa fala R$ 26.300, e não
 * R$ 26.300,00"*). Das 1.412 vendas ativas desde 2023, **53 têm centavo**, e
 * a soma delas fecha em R$ 68.003.012,58 contra R$ 68.003.016,00 da soma dos
 * arredondados.
 *
 * ESTE ARQUIVO EXISTE PARA SEGURAR A DECISÃO. Ela já foi tomada nos dois
 * sentidos em seis dias; a próxima vez que alguém cortar o centavo, cai aqui
 * antes de chegar à conversa.
 *
 * E ERA UMA FUNÇÃO DE DEZ: havia dez formatadores de dinheiro na casa — QUATRO
 * deles chamados `moeda` —, e eles discordavam. O canal da Helena mostrava
 * centavo, o da Anastasia não, e o `pecas-por-valor` fazia os dois na MESMA
 * mensagem ("acima de R$ 100.000" no título, "R$ 52.500,00" na linha). Sobrou
 * este.
 * ==========================================================================
 *
 * O NBSP: o `toLocaleString` separa o "R$" do número com espaço que NÃO quebra
 * linha (U+00A0). Comparar com espaço comum falha por um caractere invisível,
 * então aqui ele é trocado antes de cada asserção — a mesma armadilha já
 * documentada no `fotos-de-peca-pelo-whatsapp.spec.ts`.
 */
const NBSP = String.fromCharCode(160);
const ESPACO = String.fromCharCode(32);
const semNbsp = (v: number) => moeda(v).split(NBSP).join(ESPACO);

describe('moeda — o valor sai exato', () => {
  /* ESTE É O TESTE. */
  it('o centavo APARECE, e não é arredondado', () => {
    // O número real da venda 1157, que era mostrado como "R$ 69.935".
    expect(semNbsp(69934.67)).toBe('R$ 69.934,67');
  });

  it('valor redondo também leva ",00" — a coluna não alterna de desenho', () => {
    // Esconder o ",00" faria a mesma lista escrever o dinheiro de dois jeitos
    // conforme o número, e quem lê uma coluna de valores repara na coluna.
    expect(semNbsp(26300)).toBe('R$ 26.300,00');
  });

  it('o milhar é brasileiro: ponto no milhar, vírgula no centavo', () => {
    // Se a formatação fosse no SQL, o `to_char` usaria a localidade do banco e
    // sairia "R$ 69,934.67" — invertido.
    expect(semNbsp(11967058)).toBe('R$ 11.967.058,00');
  });

  it('nunca mais corta: duas casas, nem uma nem três', () => {
    // Guarda contra um `maximumFractionDigits` reposto por engano.
    for (const v of [0.5, 1.005, 999.999, 1e6 + 0.01]) {
      expect(semNbsp(v)).toMatch(/^R\$ [\d.]+,\d{2}$/);
    }
  });

  it('o zero é "R$ 0,00", e quem não tem preço resolve isso fora daqui', () => {
    // `processar-foto-catalogo` devolve traço para peça sem preço, justamente
    // porque "R$ 0,00" AFIRMA preço zero. A decisão é dele, não desta função.
    expect(semNbsp(0)).toBe('R$ 0,00');
  });

  it('negativo sai com sinal — devolução não vira crédito silencioso', () => {
    expect(semNbsp(-110460)).toBe('-R$ 110.460,00');
  });
});
