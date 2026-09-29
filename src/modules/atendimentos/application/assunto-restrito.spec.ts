import { assuntosRestritosEm } from './assunto-restrito';

/**
 * O DETECTOR DO RN-01(g).
 *
 * O que ele protege nao e o dado — esse ja nao existe no caminho da vendedora.
 * E o REGISTRO: a Equipe AT pediu para saber quando a pergunta acontece.
 *
 * Os testes de falso positivo valem tanto quanto os de deteccao. Registrar
 * "quantas clientes atendi hoje" como tentativa de ver estoque enche a tela de
 * ruido, e uma lista cheia de ruido deixa de ser lida — que e o mesmo
 * resultado de nao ter lista nenhuma.
 */
describe('assuntosRestritosEm', () => {
  describe('quantidade', () => {
    it.each([
      'quantas peças tem desse anel?',
      'quantos aneis dourados temos',
      'qual a quantidade do CO26185?',
      'me diz a qtd que sobrou',
      'quanto tem em estoque do brinco?',
      'qual o saldo em estoque dessa peça',
      'tem quantas dessas?',
    ])('pega "%s"', (frase) => {
      expect(assuntosRestritosEm(frase)).toContain('quantidade');
    });

    it('funciona sem acento — e como se digita no WhatsApp', () => {
      expect(assuntosRestritosEm('quantas pecas tem')).toContain('quantidade');
    });
  });

  describe('custo', () => {
    it.each([
      'qual o preço de custo dessa peça?',
      'me passa o custo',
      'quanto a loja pagou nesse anel',
      'qual a margem dessa peça?',
      'qual o valor de compra?',
      'quanto a gente lucra nisso',
    ])('pega "%s"', (frase) => {
      expect(assuntosRestritosEm(frase)).toContain('custo');
    });
  });

  it('uma pergunta pode ter os dois assuntos', () => {
    // Registrar so um perderia metade do que a Equipe AT quer enxergar.
    expect(assuntosRestritosEm('qual o custo e quantas peças tem?')).toEqual([
      'quantidade',
      'custo',
    ]);
  });

  describe('o que NAO pode virar registro', () => {
    it.each([
      // "quantas" sozinho e pergunta legitima sobre o trabalho dela
      'quantas clientes eu atendi hoje?',
      'quantos leads chegaram essa semana',
      'quantas vendas eu fiz no mês?',
      // preco de VENDA ela pode e deve saber
      'qual o preço desse anel?',
      'quanto custa pro cliente?',
      'me manda o valor de venda',
      // o resto do dia a dia
      'qual minha agenda de amanhã',
      'a dona Marina já comprou comigo?',
      'tem esse anel disponível?',
    ])('ignora "%s"', (frase) => {
      expect(assuntosRestritosEm(frase)).toEqual([]);
    });
  });

  it('mensagem vazia nao registra nada', () => {
    expect(assuntosRestritosEm('')).toEqual([]);
  });
});
