import { Produto, type ProdutoProps } from './produto.entity';

/**
 * O QUE SAI DA PECA PELA API — 29/09/2026.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE: A CHAVE AUSENTE, E NAO O VALOR NULO.
 *
 * Requisito RN-01(a): "o campo nao deve vir no JSON para o perfil sem
 * permissao; nao basta vir nulo na tela". Por isso quase todo teste aqui usa
 * `toHaveProperty` / `not.toHaveProperty`, e nao comparacao de valor —
 * `valorCusto: null` passaria num teste de valor e falharia o requisito.
 *
 * Ate 29/09 o controller devolvia a entidade crua, entao `valorCusto`,
 * `valorCompra`, `margemPercentual` e `estoqueAtual` viajavam para qualquer um
 * com `produtos:read` — inclusive o papel VENDEDORA, que tem essa permissao.
 * ==========================================================================
 */

const BASE: ProdutoProps = {
  id: 'p-1',
  idErp: '9001',
  codigoErp: 'AN25258',
  categoria: 'JOIAS',
  familia: 'ANEL',
  unidade: 'UN',
  valorVenda: 17490,
  valorCompra: 17490,
  valorCusto: 5830,
  margemPercentual: 3,
  ativo: true,
  estoqueAtual: 4,
  posicoes: [
    { empresa: 'AT JEWEL LTDA', local: 'ESTOQUE', grupo: 'VITRINE', quantidade: 3 },
    { empresa: 'AT HOME LTDA', local: 'ESTOQUE', grupo: 'VITRINE', quantidade: 1 },
    // A carga do integrador cria uma linha zerada para quase toda peca em
    // quase todo lugar. E ela que torna a lista COMPLETA sem quantidade
    // inutil — e perigosa, se fosse enviada.
    { empresa: 'MP COMERCIO DE METAIS LTDA', local: 'ESTOQUE', grupo: 'COFRE', quantidade: 0 },
  ],
};

const peca = (p: Partial<ProdutoProps> = {}) =>
  Produto.create({ ...BASE, ...p });

describe('Produto.toPublic', () => {
  describe('sem permissao nenhuma — o caso da vendedora', () => {
    it('o padrao e o RESTRITO: chamar sem argumento nao entrega nada', () => {
      const r = peca().toPublic();

      // Se alguem inverter os defaults de `OpcoesDeExibicao` por conveniencia,
      // e este teste que quebra. E a regra RN-03 (negar por padrao) em forma
      // executavel.
      expect(r).not.toHaveProperty('valorCusto');
      expect(r).not.toHaveProperty('estoqueAtual');
    });

    it('custo, compra e margem NAO EXISTEM no objeto', () => {
      const r = peca().toPublic({ custo: false, quantidade: false });

      expect(r).not.toHaveProperty('valorCusto');
      expect(r).not.toHaveProperty('valorCompra');
      // A margem e custo disfarcado: `valorVenda / margem` devolve o custo com
      // uma divisao. Liberar a margem e liberar o custo pela porta dos fundos.
      expect(r).not.toHaveProperty('margemPercentual');
    });

    it('o saldo NAO EXISTE; no lugar vem `disponivel`', () => {
      const r = peca().toPublic();

      expect(r).not.toHaveProperty('estoqueAtual');
      expect(r.disponivel).toBe(true);
    });

    it('peca zerada devolve `disponivel: false`, e nao o zero', () => {
      const r = peca({ estoqueAtual: 0, posicoes: [] }).toPublic();

      expect(r).not.toHaveProperty('estoqueAtual');
      expect(r.disponivel).toBe(false);
    });

    it('o preco de VENDA continua saindo — sem ele ela nao atende ninguem', () => {
      expect(peca().toPublic().valorVenda).toBe(17490);
    });

    describe('as posicoes', () => {
      const posicoes = () =>
        peca().toPublic().posicoes as Record<string, unknown>[];

      it('nenhuma delas carrega quantidade', () => {
        for (const p of posicoes()) expect(p).not.toHaveProperty('quantidade');
      });

      it('so as que TEM saldo saem — a zerada fica de fora', () => {
        // Este e o teste que impede o vazamento sutil: mandar TODAS as
        // posicoes sem numero pareceria mais restritivo e seria inutil, porque
        // a carga do integrador cria linha zerada em quase todo lugar e a
        // lista deixaria de distinguir onde ha saldo.
        expect(posicoes()).toHaveLength(2);
        expect(posicoes().map((p) => p.empresa)).toEqual([
          'AT JEWEL LTDA',
          'AT HOME LTDA',
        ]);
      });

      it('o ONDE fica de pe — e o que o requisito P-03 exige', () => {
        // "A vendedora de Fortaleza pode vender uma peca de SP, entao tem que
        // saber se tem em estoque e o preco de venda."
        expect(posicoes()[0]).toEqual({
          empresa: 'AT JEWEL LTDA',
          local: 'ESTOQUE',
          grupo: 'VITRINE',
        });
      });
    });
  });

  describe('com as duas permissoes — o caso da Equipe AT', () => {
    const completo = () => peca().toPublic({ custo: true, quantidade: true });

    it('custo, compra e margem voltam', () => {
      expect(completo().valorCusto).toBe(5830);
      expect(completo().valorCompra).toBe(17490);
      expect(completo().margemPercentual).toBe(3);
    });

    it('o saldo volta, e `disponivel` NAO aparece junto', () => {
      expect(completo().estoqueAtual).toBe(4);
      // Os dois nunca convivem: dois contratos para a mesma pergunta fariam a
      // tela ter de escolher um, e escolher errado em algum lugar.
      expect(completo()).not.toHaveProperty('disponivel');
    });

    it('as posicoes voltam INTEIRAS, inclusive a zerada', () => {
      const posicoes = completo().posicoes as Record<string, unknown>[];

      // A zerada importa para quem ve o numero: a tela filtra por empresa,
      // local e grupo, e a peca que existe num lugar com zero precisa ser
      // achada ali.
      expect(posicoes).toHaveLength(3);
      expect(posicoes[2]).toMatchObject({ grupo: 'COFRE', quantidade: 0 });
    });
  });

  describe('as duas permissoes sao independentes', () => {
    it('custo sem quantidade: ve o custo, nao ve o saldo', () => {
      const r = peca().toPublic({ custo: true, quantidade: false });

      expect(r.valorCusto).toBe(5830);
      expect(r).not.toHaveProperty('estoqueAtual');
      expect(r.disponivel).toBe(true);
    });

    it('quantidade sem custo: ve o saldo, nao ve o custo — e o caso da gerente', () => {
      const r = peca().toPublic({ custo: false, quantidade: true });

      expect(r.estoqueAtual).toBe(4);
      expect(r).not.toHaveProperty('valorCusto');
      expect(r).not.toHaveProperty('margemPercentual');
    });
  });

  it('o que nao e sensivel sai sempre, com ou sem permissao', () => {
    const restrito = peca().toPublic();
    const completo = peca().toPublic({ custo: true, quantidade: true });

    for (const campo of ['id', 'codigoErp', 'categoria', 'familia', 'ativo']) {
      expect(restrito[campo]).toEqual(completo[campo]);
    }
  });
});
