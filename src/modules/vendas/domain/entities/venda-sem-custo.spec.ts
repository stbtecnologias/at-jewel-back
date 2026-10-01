import { ItemVenda } from './item-venda.entity';
import { Venda } from './venda.entity';

/**
 * O CUSTO NAO SAI PELA VENDA — 01/10/2026.
 *
 * ==========================================================================
 * REINCIDENCIA, E E ISSO QUE ESTE ARQUIVO GUARDA.
 *
 * Em 28/09 o custo foi fechado no serializador do PRODUTO, com a licao
 * escrita no repositorio: *um campo sensivel nao se protege no serializador,
 * se protege em TODA porta por onde ele sai*. Esta porta ficou aberta mais
 * tres dias.
 *
 * `GET /vendas/:id` exige `vendas:read_all`. O `GERENTE_VENDAS` tem essa
 * chave e NAO tem `produtos:custo` — de proposito, pela migracao 72, que diz
 * que ela acompanha o time dela e nao ve custo nem margem. Bastava abrir uma
 * venda.
 * ==========================================================================
 *
 * AUSENCIA DA CHAVE, E NAO VALOR NULO — criterio CA-02 de 28/09, e a
 * diferenca nao e formalidade: `valorCustoUnitario: null` ainda contaria
 * quantas pecas nao tem custo, e num item com valor ao lado entregaria quais
 * tem. Por isso o teste usa `toHaveProperty`, nunca comparacao de valor.
 */

const ITEM = () =>
  ItemVenda.create({
    produtoId: 'p-1',
    quantidade: 2,
    valorUnitario: 1890,
    valorCustoUnitario: 620,
    valorDescontoItem: 0,
    valorTotalItem: 3780,
  });

const VENDA = () =>
  Venda.create({
    clienteId: 'c-1',
    vendedoraId: 'v-1',
    dataVenda: new Date('2026-10-01T10:00:00-03:00'),
    valorBruto: 3780,
    valorDesconto: 0,
    valorTotal: 3780,
    status: 'CONCLUIDA',
    itens: [ITEM()],
    pagamentos: [],
  } as never);

describe('Venda.toPublic — o custo por peça', () => {
  const itensDe = (r: Record<string, unknown>) =>
    r.itens as Record<string, unknown>[];

  describe('sem `produtos:custo`', () => {
    it('a chave do custo NÃO EXISTE no item', () => {
      const itens = itensDe(VENDA().toPublic(false));

      expect(itens[0]).not.toHaveProperty('valorCustoUnitario');
    });

    it('é o DEFAULT: quem esquecer de passar recebe a versão estreita', () => {
      // Errar para o lado seguro. Mesma ordem do `Cliente.toPublic`, onde o
      // default e mascarar.
      const itens = itensDe(VENDA().toPublic());

      expect(itens[0]).not.toHaveProperty('valorCustoUnitario');
    });

    it('o resto do item continua inteiro', () => {
      const item = itensDe(VENDA().toPublic(false))[0];

      expect(item.quantidade).toBe(2);
      expect(item.valorUnitario).toBe(1890);
      expect(item.valorTotalItem).toBe(3780);
      expect(item.valorDescontoItem).toBe(0);
      expect(item.produtoId).toBe('p-1');
    });

    it('a venda em volta não muda', () => {
      const r = VENDA().toPublic(false);

      expect(r.valorTotal).toBe(3780);
      expect(r.status).toBe('CONCLUIDA');
      expect(r.vendedoraId).toBe('v-1');
      expect(itensDe(r)).toHaveLength(1);
    });
  });

  describe('com `produtos:custo`', () => {
    it('o custo volta, e nada mais muda', () => {
      const item = itensDe(VENDA().toPublic(true))[0];

      expect(item.valorCustoUnitario).toBe(620);
      expect(item.valorUnitario).toBe(1890);
    });

    it('as duas versões têm as MESMAS chaves, menos uma', () => {
      // Se um dia alguem acrescentar campo no ramo condicional sem querer,
      // esta conta acusa.
      const comCusto = Object.keys(itensDe(VENDA().toPublic(true))[0]);
      const sem = Object.keys(itensDe(VENDA().toPublic(false))[0]);

      expect(comCusto.length - sem.length).toBe(1);
      expect(comCusto.filter((k) => !sem.includes(k))).toEqual([
        'valorCustoUnitario',
      ]);
    });
  });

  it('a listagem nunca carregou item — e continua sem carregar', () => {
    // `toResumo` e o que a tela de Vendas usa. O vazamento era so no detalhe,
    // e este teste e o que impede alguem "uniformizar" os dois um dia.
    const resumo = VENDA().toResumo();

    expect(resumo).not.toHaveProperty('itens');
    expect(JSON.stringify(resumo)).not.toContain('620');
  });
});
