import {
  STATUS_DE_MOVIMENTACAO,
  devolucaoEfetiva,
  formaPagamentoDe,
  receitaLiquida,
  valorAssinado,
  vendaEfetiva,
} from './movimentacao-como-venda';

/**
 * O TEXTO DO SQL FICA TRAVADO AQUI — 01/10/2026.
 *
 * ==========================================================================
 * ESTE SPEC NAO TESTA LOGICA. ELE IMPEDE UMA EDICAO SILENCIOSA.
 *
 * O fragmento decide a receita que a tela de Vendas e o Analytics mostram, e
 * que a Anastasia responde no WhatsApp. Em 25/09 as duas pontas discordaram em
 * R$ 279.680,00 no mesmo agosto, porque a tela somava so as saidas.
 *
 * Quem mexer na expressao vai ver ESTE teste falhar, e ai e decisao
 * consciente — em vez de o numero da tela mudar sem ninguem notar.
 * ==========================================================================
 */

const semEspacos = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('movimentacao lida como venda — o fragmento', () => {
  describe('o status derivado', () => {
    /* ESTE E O TESTE. O resto e contorno. */
    it('cancelada vem ANTES de devolvida — a ordem e a regra', () => {
      // `ativo = false` e como o ERP cancela: reenvio da MESMA movimentacao com
      // o campo falso. Uma devolucao cancelada e cancelada, nao devolvida — e
      // trocar a ordem dos ramos inverteria isso sem erro de sintaxe.
      const sql = semEspacos(STATUS_DE_MOVIMENTACAO);

      expect(sql.indexOf('cancelada')).toBeLessThan(sql.indexOf('devolvida'));
      expect(sql.indexOf('devolvida')).toBeLessThan(sql.indexOf('concluida'));
    });

    it('os tres estados existem, e `pendente` NAO', () => {
      // A movimentacao so nasce depois de o fato acontecer: nao existe venda
      // pendente. Se `pendente` aparecer aqui, alguem trouxe de volta o enum
      // da tabela `vendas`.
      expect(STATUS_DE_MOVIMENTACAO).toContain("'cancelada'");
      expect(STATUS_DE_MOVIMENTACAO).toContain("'devolvida'");
      expect(STATUS_DE_MOVIMENTACAO).toContain("'concluida'");
      expect(STATUS_DE_MOVIMENTACAO).not.toContain('pendente');
    });

    it('usa o alias `m`, que e o da tabela nas consultas', () => {
      expect(STATUS_DE_MOVIMENTACAO).toContain('m.ativo');
      expect(STATUS_DE_MOVIMENTACAO).toContain('m.entrada');
    });
  });

  describe('a receita', () => {
    /* ESTE E O TESTE. */
    it('SUBTRAI a devolucao — e e isto que alinha a tela ao WhatsApp', () => {
      const sql = semEspacos(receitaLiquida('m'));

      expect(sql).toContain('- COALESCE(sum(m.valor) FILTER (WHERE m.entrada AND m.ativo), 0)');
      expect(sql.startsWith('COALESCE(sum(m.valor) FILTER (WHERE m.saida AND m.ativo), 0)')).toBe(
        true,
      );
    });

    it('a saida entra positiva e a entrada negativa, nunca o contrario', () => {
      const sql = semEspacos(receitaLiquida());
      const iSaida = sql.indexOf('m.saida');
      const iMenos = sql.indexOf(' - ');
      const iEntrada = sql.indexOf('m.entrada');

      expect(iSaida).toBeLessThan(iMenos);
      expect(iMenos).toBeLessThan(iEntrada);
    });

    it('o alias e parametro — dentro da CTE a tabela se chama `f`', () => {
      const sql = receitaLiquida('f');

      expect(sql).toContain('f.valor');
      expect(sql).not.toContain('m.valor');
    });

    it('o campo tambem e parametro, para o item somar quantidade', () => {
      expect(receitaLiquida('m', 'quantidade')).toContain('sum(m.quantidade)');
    });

    it('as duas pontas exigem `ativo`: cancelada nao soma nem abate', () => {
      const sql = receitaLiquida('m');

      expect(sql.match(/m\.ativo/g)).toHaveLength(2);
    });
  });

  describe('o valor assinado, para somar depois', () => {
    it('cancelada vale ZERO, e nao o valor nem o negativo', () => {
      const sql = semEspacos(valorAssinado('m'));

      expect(sql).toContain('WHEN NOT m.ativo THEN 0');
    });

    it('devolucao entra negativa', () => {
      expect(semEspacos(valorAssinado('m'))).toContain('WHEN m.entrada THEN -m.valor');
    });

    it('da o MESMO total que a receita agregada', () => {
      // Nao da para rodar SQL aqui, mas da para garantir que as duas expressoes
      // falam da mesma coisa: as duas olham `ativo`, `entrada` e o valor.
      const a = valorAssinado('m');
      const b = receitaLiquida('m');

      for (const campo of ['m.ativo', 'm.entrada', 'm.valor']) {
        expect(a).toContain(campo);
        expect(b).toContain(campo);
      }
    });
  });

  describe('a forma de pagamento', () => {
    /* ESTE E O TESTE. */
    it('PREFERE o id resolvido, e cai no `_id_erp` — nesta ordem', () => {
      // `forma_pagamento_id` esta nulo nas 1.730 parcelas porque a ingestao nao
      // resolve essa ponta. No dia em que resolver, este COALESCE continua
      // certo — mas so porque o id resolvido vem PRIMEIRO. Invertido, a
      // correcao da ingestao nao teria efeito nenhum.
      const sql = formaPagamentoDe('mp');

      expect(sql.indexOf('mp.forma_pagamento_id,')).toBeLessThan(
        sql.indexOf('mp.forma_pagamento_id_erp'),
      );
    });

    it('converte o `_id_erp` para uuid — a coluna e texto', () => {
      expect(formaPagamentoDe('mp')).toContain('::uuid');
    });
  });

  describe('venda e devolucao efetivas', () => {
    it('as duas exigem `ativo`', () => {
      expect(vendaEfetiva('m')).toBe('m.saida AND m.ativo');
      expect(devolucaoEfetiva('m')).toBe('m.entrada AND m.ativo');
    });

    it('sao excludentes: uma olha saida, a outra entrada', () => {
      expect(vendaEfetiva()).not.toContain('entrada');
      expect(devolucaoEfetiva()).not.toContain('saida');
    });
  });
});
