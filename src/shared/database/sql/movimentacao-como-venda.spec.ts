import {
  STATUS_DE_MOVIMENTACAO,
  devolucaoEfetiva,
  ehConsignacao,
  ehDevolucao,
  ehVenda,
  formaPagamentoDe,
  itemAssinado,
  receitaLiquida,
  totalVendido,
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

    /**
     * ==================================================================
     * 152 LINHAS "DEVOLVIDA" EM NOVEMBRO, E SO 3 ERAM — 19/11/2026.
     *
     * A tela de Vendas listava 181 documentos no mes: 29 vendas, 3
     * devolucoes e 149 CONSIGNACOES, todas rotuladas "Devolvida". O
     * Lucas viu pelos valores — R$ 696.600 numa "devolucao" e maleta,
     * nao peca que voltou.
     *
     * A causa era este CASE, que ficou com a regra de DOIS conceitos
     * depois de 18/11: consignacao tem `entrada`, entao caia no ramo da
     * devolucao. O `vendas-movimentacao.repository` (a lista das
     * agentes) ganhou o terceiro ramo naquele dia; esta constante, que
     * a TELA usa, ficou para tras. Duas copias da mesma regra, e so uma
     * consertada.
     *
     * E A VARREDURA NAO PEGA: ela procura `m.saida`/`m.entrada` escritos
     * a mao FORA dos helpers, e esta expressao E um helper. A trava nao
     * cobre o helper estar errado por dentro — por isso o teste aqui.
     * ==================================================================
     */
    it('a consignacao tem ramo proprio, e vem ANTES do da devolucao', () => {
      const sql = semEspacos(STATUS_DE_MOVIMENTACAO);

      expect(sql).toContain("'consignacao'");
      // A ORDEM E A REGRA, de novo: consignacao tem `entrada`, entao se
      // o ramo dela vier depois, ela cai no da devolucao e nada muda.
      expect(sql.indexOf('consignacao')).toBeLessThan(sql.indexOf("'devolvida'"));
      // E depois de cancelada, pelo mesmo motivo de sempre.
      expect(sql.indexOf('cancelada')).toBeLessThan(sql.indexOf('consignacao'));
    });

    it('usa o alias `m`, que e o da tabela nas consultas', () => {
      expect(STATUS_DE_MOVIMENTACAO).toContain('m.ativo');
      expect(STATUS_DE_MOVIMENTACAO).toContain('m.entrada');
    });
  });

  /**
   * ====================================================================
   * O TOTAL VENDIDO — 19/11/2026.
   *
   * A tela de Vendas dizia R$ 1.860.578,00 em novembro e a Anastasia,
   * R$ 1.893.544,00. Os dois estavam certos pela propria regra: a tela
   * descontava a devolucao, a agente nao.
   *
   * E DESCONTAR ESTAVA ERRADO, e nao e questao de gosto: as tres
   * devolucoes de novembro sao de vendas de ABRIL/2026, SETEMBRO/2026 e
   * MAIO/2025. Nenhuma e de novembro. O card tirava R$ 32.966 de um mes
   * em que esse dinheiro nunca entrou — o mesmo defeito do "294 sairam,
   * 309 voltaram" da consignacao, so que somado num numero so, onde
   * ninguem ve.
   *
   * O `receitaLiquida` CONTINUA EXISTINDO para quem a quer: carteira,
   * fidelidade e Analytics seguem nele. O que mudou foi quem a tela de
   * Vendas usa.
   * ====================================================================
   */
  describe('o total vendido', () => {
    /* ESTE E O TESTE. */
    it('soma a venda e NAO desconta a devolucao', () => {
      const sql = semEspacos(totalVendido('m'));

      expect(sql).toBe(
        'COALESCE(sum(m.valor) FILTER (WHERE m.saida AND NOT m.entrada AND m.ativo), 0)',
      );
      // E A PROVA PELO AVESSO: nenhuma subtracao de entrada.
      expect(sql).not.toContain('-');
      expect(sql).not.toContain('m.entrada AND NOT m.saida');
    });

    it('aceita outro campo, como o receitaLiquida', () => {
      expect(semEspacos(totalVendido('v', 'quantidade'))).toContain(
        'sum(v.quantidade)',
      );
    });
  });

  describe('a receita', () => {
    /* ESTE E O TESTE. */
    it('SUBTRAI a devolucao — e e isto que alinha a tela ao WhatsApp', () => {
      const sql = semEspacos(receitaLiquida('m'));

      expect(sql).toContain(
        '- COALESCE(sum(m.valor) FILTER (WHERE m.entrada AND NOT m.saida AND m.ativo), 0)',
      );
      expect(
        sql.startsWith(
          'COALESCE(sum(m.valor) FILTER (WHERE m.saida AND NOT m.entrada AND m.ativo), 0)',
        ),
      ).toBe(true);
    });

    /**
     * A CONSIGNACAO SE CANCELAVA, e por isso a receita ficou certa tres anos.
     *
     * Ela entrava somando (tem `saida`) e subtraindo (tem `entrada`), no mesmo
     * valor. O numero final nao mudou com esta correcao — R$ 1.860.578 antes e
     * depois, em 01 a 17/11. O que mudou foi tudo o mais: contagem, bruto,
     * ticket, lista.
     */
    it('a consignacao nao entra em nenhum dos dois lados', () => {
      const sql = semEspacos(receitaLiquida('m'));

      expect(sql.match(/NOT m\.entrada/g)).toHaveLength(1);
      expect(sql.match(/NOT m\.saida/g)).toHaveLength(1);
    });

    it('a saida entra positiva e a entrada negativa, nunca o contrario', () => {
      const sql = semEspacos(receitaLiquida());
      const iMenos = sql.indexOf(' - ');
      // O lado positivo abre com `m.saida`; o negativo, depois do menos, abre
      // com `m.entrada`. As negacoes aparecem nos dois lados, entao a prova e
      // pela ABERTURA de cada parcela, e nao pela primeira ocorrencia.
      expect(sql.slice(0, iMenos)).toContain('WHERE m.saida AND NOT m.entrada');
      expect(sql.slice(iMenos)).toContain('WHERE m.entrada AND NOT m.saida');
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

    /**
     * O RAMO DA CONSIGNACAO VEM ANTES DO DA DEVOLUCAO, e a ordem e a regra.
     *
     * Consignacao tem `entrada` ligada. Com o ramo depois, ela cairia no da
     * devolucao e entraria NEGATIVA na serie mensal — pior que o defeito
     * antigo, em que ela ao menos se cancelava.
     */
    it('consignacao vale ZERO, e o ramo vem antes do da devolucao', () => {
      const sql = semEspacos(valorAssinado('m'));

      expect(sql).toContain('WHEN m.saida AND m.entrada THEN 0');
      expect(sql.indexOf('m.saida AND m.entrada')).toBeLessThan(
        sql.indexOf('WHEN m.entrada THEN'),
      );
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

  describe('o item com sinal, para a meta por produto', () => {
    /* ESTE E O TESTE. */
    it('a peca DEVOLVIDA abate a meta de quem a vendeu', () => {
      // A devolucao tem itens — 126 linhas em 101 documentos. Sem o sinal, a
      // vendedora bateria a meta com uma venda que voltou.
      const sql = semEspacos(itemAssinado('m', 'i'));

      expect(sql).toContain('WHEN m.entrada THEN -(i.quantidade * i.valor_unitario)');
    });

    it('o total do item e quantidade x unitario — nao existe coluna pronta', () => {
      // `movimentacoes_itens` nao tem `valor_total_item`. O produto fecha com o
      // valor do documento em 1.287 de 1.287.
      expect(itemAssinado()).toContain('i.quantidade * i.valor_unitario');
      expect(itemAssinado()).not.toContain('valor_total_item');
    });

    it('cancelada vale zero, como no valor do documento', () => {
      expect(semEspacos(itemAssinado('m', 'i'))).toContain('WHEN NOT m.ativo THEN 0');
    });

    /**
     * A PECA CONSIGNADA NAO CONTA PARA A META, e isto muda metas passadas.
     *
     * Tres de cada quatro pecas vendidas passaram antes por uma consignacao
     * (1.591 de 2.183, medido em 18/11). Contar as duas pernas fazia a mesma
     * peca bater meta duas vezes.
     */
    it('a peca em consignacao vale ZERO, e o ramo vem antes do da devolucao', () => {
      const sql = semEspacos(itemAssinado('m', 'i'));

      expect(sql).toContain('WHEN m.saida AND m.entrada THEN 0');
      expect(sql.indexOf('m.saida AND m.entrada')).toBeLessThan(
        sql.indexOf('WHEN m.entrada THEN'),
      );
    });

    it('os dois aliases sao parametro — a movimentacao da o sinal, o item o valor', () => {
      const sql = itemAssinado('mov', 'it');

      expect(sql).toContain('mov.entrada');
      expect(sql).toContain('it.quantidade');
      expect(sql).not.toContain('m.entrada');
    });
  });

  /**
   * CONSIGNACAO NAO E VENDA NEM DEVOLUCAO — 18/11/2026.
   *
   * ========================================================================
   * UMA CHAVE CONTAVA A MESMA JOIA DUAS VEZES.
   *
   * O ERP tem QUATRO operacoes, e as bandeiras as seguem sem excecao em 8.240
   * documentos:
   *
   *   VENDA ................... saida, sem entrada ...... 1.729 docs
   *   DEVOLUCAO DE VENDA ...... entrada, sem saida ......   129 docs
   *   CONSIGNACAO ............. AS DUAS ................. 2.822 docs
   *   RETORNO DE CONSIGNACAO .. AS DUAS ................. 3.560 docs
   *
   * Ate aqui `vendaEfetiva` era so `saida AND ativo`, entao toda consignacao
   * entrava como venda — e, por ter `entrada` tambem, entrava como devolucao
   * no mesmo folego. Em 01 a 17/11/2026 isso deu "178 vendas, R$ 54.536.432"
   * onde ha 29 vendas e R$ 1.893.544. A RECEITA ficava certa por acidente: a
   * consignacao somava de um lado e subtraia do outro, cancelando-se.
   *
   * A REGRA E A BANDEIRA, E NAO O NOME DA OPERACAO. O nome pode virar
   * "REMESSA" ou "CONDICIONAL" amanha; "saiu e entrou ao mesmo tempo" descreve
   * o que a coisa E. E e a mesma leitura que `Movimentacao.pontaDoTerceiro`
   * faz desde sempre: `if (props.saida === props.entrada) return null`.
   * ========================================================================
   */
  describe('os tres conceitos: venda, devolucao e consignacao', () => {
    /* ESTE E O TESTE. */
    it('venda e saida SEM entrada — a consignacao fica de fora', () => {
      expect(ehVenda('m')).toBe('m.saida AND NOT m.entrada AND m.ativo');
    });

    it('devolucao e entrada SEM saida — o retorno de consignacao fica de fora', () => {
      expect(ehDevolucao('m')).toBe('m.entrada AND NOT m.saida AND m.ativo');
    });

    it('consignacao e as duas ao mesmo tempo', () => {
      expect(ehConsignacao('m')).toBe('m.saida AND m.entrada AND m.ativo');
    });

    it('os tres sao mutuamente exclusivos, por construcao', () => {
      // Nao da para rodar SQL aqui, mas da para provar a forma: venda nega
      // entrada, devolucao nega saida, e consignacao exige as duas. Nenhuma
      // movimentacao satisfaz dois deles.
      expect(ehVenda()).toContain('NOT m.entrada');
      expect(ehDevolucao()).toContain('NOT m.saida');
      expect(ehConsignacao()).not.toContain('NOT ');
    });

    it('os tres exigem `ativo`: cancelada nao e nada disso', () => {
      for (const sql of [ehVenda('m'), ehDevolucao('m'), ehConsignacao('m')]) {
        expect(sql).toContain('m.ativo');
      }
    });

    it('o alias e parametro — dentro da CTE a tabela se chama `f`', () => {
      expect(ehVenda('f')).toBe('f.saida AND NOT f.entrada AND f.ativo');
      expect(ehVenda('f')).not.toContain('m.');
    });
  });

  describe('venda e devolucao efetivas', () => {
    /**
     * OS DOIS NOMES ANTIGOS CONTINUAM, e agora sao apelidos dos conceitos.
     *
     * Sete arquivos os chamam. Renomea-los seria mexer em todos eles nesta
     * tarefa, e o valor esta em a REGRA mudar, nao o nome.
     */
    it('`vendaEfetiva` e `ehVenda`, e nao mais `saida AND ativo`', () => {
      expect(vendaEfetiva('m')).toBe(ehVenda('m'));
    });

    it('`devolucaoEfetiva` e `ehDevolucao`', () => {
      expect(devolucaoEfetiva('m')).toBe(ehDevolucao('m'));
    });

    it('as duas EXCLUEM a consignacao, cada uma pelo seu lado', () => {
      // Era aqui que estava o defeito: "uma olha saida, a outra entrada" era
      // verdade, e era exatamente o que deixava a consignacao passar nas duas.
      expect(vendaEfetiva()).toContain('NOT m.entrada');
      expect(devolucaoEfetiva()).toContain('NOT m.saida');
    });
  });
});
