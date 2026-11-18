import { moeda } from '../../../shared/formato/moeda';
import { FerramentasGestaoService } from './ferramentas-gestao.service';

/**
 * ==========================================================================
 * A MESMA PERGUNTA COM DUAS RESPOSTAS — produção, 27/10/2026, 14:07.
 *
 *   — "quais as vendas da Ylka em 2025 e 2026"
 *   — "Em 2026 (até hoje) — 38 vendas, R$ 2.230.827..."
 *   — "me lista"
 *   — "São 43 vendas em 2026; estas são as 10 mais recentes:"
 *     ...
 *     "6. 05/08 · doc 98 · Maria Aurora — R$ 110.460 — DEVOLVIDA"
 *
 * 38 e 43, na mesma conversa, para a mesma pergunta — e nenhuma das duas
 * dizendo qual era qual. 43 eram as MOVIMENTAÇÕES ativas: 38 saídas e 5
 * entradas. A prova estava na própria lista, no item 6.
 *
 * Esta era a ÚNICA consulta da casa fora da regra: as outras onze de vendas,
 * as sete da carteira e a da linha do tempo sempre filtraram `m.saida`.
 *
 * Decisão do Lucas: *"se ela pediu as vendas.. só o que foi concluído..
 * devolução só se ela perguntar"*.
 * ==========================================================================
 */

/** Qualquer colaborador que este teste não toca. Tocar nele estoura. */
function naoParaTudo(nome: string) {
  return new Proxy(
    {},
    {
      get: () => {
        throw new Error(`o teste encostou em ${nome}, e não devia`);
      },
    },
  );
}

const UMA_VENDA = {
  documento: '1157',
  data: new Date('2026-08-12T12:00:00Z'),
  clienteCodigo: '00376',
  cliente: 'Cliente A',
  vendedora: 'Ylka',
  valor: 52500,
  status: 'concluida',
  itens: [{ quantidade: 1, nome: 'Brinco DTS', valor: 52500 }],
};

const UMA_DEVOLUCAO = {
  ...UMA_VENDA,
  documento: '98',
  valor: 110460,
  status: 'devolvida',
};

function montar(vendas = [UMA_VENDA], valorDevolvido = 0) {
  const detalhadas = jest
    .fn()
    .mockResolvedValue({ vendas, total: vendas.length, valorDevolvido });
  const relatorio = { guardar: jest.fn(), guardarTexto: jest.fn() };

  const deps = Array.from({ length: 32 }, (_, i) =>
    naoParaTudo(`colaborador ${i}`),
  );
  deps[0] = {
    execute: jest
      .fn()
      .mockResolvedValue({ status: 'OK', id: 'vd-1', nome: 'Ylka Franck' }),
  };
  deps[1] = { detalhadas };
  deps[23] = relatorio;

  const servico = new FerramentasGestaoService(
    ...(deps as unknown as ConstructorParameters<
      typeof FerramentasGestaoService
    >),
  );
  return { servico, detalhadas, relatorio };
}

describe('as vendas uma a uma: só o que foi concluído', () => {
  /* ESTE É O TESTE. */
  it('sem pedir nada, a consulta vai filtrada em CONCLUIDAS', async () => {
    const { servico, detalhadas } = montar();

    await servico.montar({ verLoja: true }).gestaoVendasDetalhadas({
      vendedora: 'Ylka',
      de: '2026-01-01',
      ate: '2026-12-31',
    });

    // O filtro tem de chegar ao SQL: é lá que a devolução entrava.
    expect(detalhadas.mock.calls[0][0]).toMatchObject({
      status: 'CONCLUIDAS',
    });
  });

  it('e o recado ao modelo proíbe concluir que não houve devolução', async () => {
    // Era o risco óbvio do conserto: tirar a devolução da lista e a agente
    // dizer "não teve devolução nenhuma" — pior que o número errado, porque
    // é afirmação sobre o que ela não consultou.
    const { servico } = montar();

    const r = await servico
      .montar({ verLoja: true })
      .gestaoVendasDetalhadas({ vendedora: 'Ylka' });

    expect(r.somente).toBeUndefined();
    expect(r.status).toBe('OK');
  });

  it('"quais as devoluções" vira DEVOLVIDAS, e o papel troca de nome', async () => {
    const { servico, detalhadas, relatorio } = montar([UMA_DEVOLUCAO]);

    const r = await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoVendasDetalhadas({ vendedora: 'Ylka', somente: 'DEVOLVIDAS' });

    expect(detalhadas.mock.calls[0][0]).toMatchObject({
      status: 'DEVOLVIDAS',
    });
    expect(r.somente).toBe('DEVOLVIDAS');
    expect(relatorio.guardar.mock.calls[0][1].titulo).toBe(
      'Devoluções da Ylka',
    );
    expect(relatorio.guardar.mock.calls[0][1].nota).toContain('Só devoluções');
  });

  /**
   * O FURO DA TROCA DE NOME — producao, 18/11/2026, 13:39.
   *
   *   — "Quantas pecas devolvidas em Novembro de 2026"
   *   — tabela intitulada "Listagem de Vendas - novembro de 2026",
   *     com tres linhas "Devolvida" dentro.
   *
   * A troca existia desde 27/10 e estava ancorada em `^Vendas`. O titulo
   * padrao, sem recorte de nome, e "LISTAGEM de Vendas" — que nao comeca
   * com "Vendas". A protecao passava batido justo no caso mais comum: a
   * pergunta geral, sem cliente e sem vendedora.
   */
  it('sem recorte de nome, o papel de devolucoes tambem troca de nome', async () => {
    const { servico, relatorio } = montar([UMA_DEVOLUCAO]);

    await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoVendasDetalhadas({ periodo: 'MES', somente: 'DEVOLVIDAS' });

    const titulo = relatorio.guardar.mock.calls[0][1].titulo;
    expect(titulo).toContain('Devoluções');
    // E NAO PODE SOBRAR "Vendas": o papel diz o que leva.
    expect(titulo).not.toContain('Vendas');
  });

  it('e o mesmo vale para TODAS, que tinha o mesmo furo', async () => {
    const { servico, relatorio } = montar([UMA_VENDA, UMA_DEVOLUCAO]);

    await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoVendasDetalhadas({ periodo: 'MES', somente: 'TODAS' });

    expect(relatorio.guardar.mock.calls[0][1].titulo).toContain(
      'Vendas e devoluções',
    );
  });

  it('"tudo junto" vira TODAS, e o papel diz que tem os dois', async () => {
    const { servico, detalhadas, relatorio } = montar([
      UMA_VENDA,
      UMA_DEVOLUCAO,
    ]);

    const r = await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoVendasDetalhadas({ vendedora: 'Ylka', somente: 'TODAS' });

    expect(detalhadas.mock.calls[0][0]).toMatchObject({ status: 'TODAS' });
    expect(r.somente).toBe('TODAS');
    expect(relatorio.guardar.mock.calls[0][1].titulo).toBe(
      'Vendas e devoluções da Ylka',
    );
  });

  it('a nota do padrão avisa que a devolução ficou de fora', async () => {
    // A letra miúda era "Receita desconta devoluções", e virou mentira no
    // momento em que não há devolução na tabela para descontar.
    const { servico, relatorio } = montar();

    await servico
      .montar({ verLoja: true, chaveDaConversa: 'gestao:ad-1' })
      .gestaoVendasDetalhadas({ vendedora: 'Ylka' });

    const nota = relatorio.guardar.mock.calls[0][1].nota as string;
    expect(nota).toContain('Só vendas concluídas');
    expect(nota).toContain('devolução não entra');
  });
});

/**
 * O MESMO PERIODO DA O MESMO NUMERO — 18/11/2026.
 *
 * ==========================================================================
 * DUAS FERRAMENTAS DISSERAM DOIS VALORES NA MESMA CONVERSA.
 *
 * Às 10:24 de 18/11, em producao:
 *
 *   — "Qual o valor das vendas desse mes?"  -> R$ 1.860.578,00
 *   — "Quais as vendas desse mes?"          -> rodape R$ 1.893.544,00
 *
 * Os dois estavam certos pela sua propria regra — um descontava a devolucao,
 * o outro somava as linhas visiveis —, e e exatamente por isso que o defeito
 * e grave: ninguem consegue dizer qual esta errado olhando so a tela.
 *
 * Decisao do Lucas: *"nao adianta uma ferramenta falar um valor e outra
 * falar outra. Todas as ferramentas que falam vendas e retornam valores tem
 * que estar alinhadas. O mesmo valor se for o mesmo periodo"*.
 *
 * O ALINHAMENTO VEIO PELA OUTRA PONTA. A primeira tentativa foi fazer o
 * rodape descontar a devolucao — e cairia no mesmo erro, porque medindo as 3
 * de novembro nenhuma era devolucao de venda DO MES: uma abatia uma compra de
 * 23/09, e duas eram de clientes cuja venda no periodo aconteceu DEPOIS da
 * devolucao.
 *
 * Decisao final: *"troca para as vendas limpas — R$ 1.893.544,00. Depois
 * vamos analisar como tratamos essas devolucoes"*. Entao o rodape ficou como
 * sempre foi, e quem mudou foi o `valor_das_vendas`, que passou a falar a
 * venda limpa. Os dois dizem o mesmo porque medem a mesma coisa.
 * ==========================================================================
 */
describe('o rodape da lista fala o mesmo numero que o valor_das_vendas', () => {
  it('nao desconta devolucao: o rodape e a venda limpa', async () => {
    // 2.500 devolvidos no periodo NAO entram: a lista e de venda, e o rodape
    // e dela. E o mesmo R$ 52.500 que o `valor_das_vendas` responderia.
    const { servico, relatorio } = montar([UMA_VENDA], 2500);

    await servico
      .montar({ verLoja: true })
      .gestaoVendasDetalhadas({ de: '2026-01-01', ate: '2026-12-31' });

    expect(relatorio.guardar.mock.calls[0][1].total).toMatchObject({
      valor: moeda(52500),
    });
  });

  it('sem devolucao no periodo, o rodape e a soma das linhas', async () => {
    const { servico, relatorio } = montar([UMA_VENDA], 0);

    await servico
      .montar({ verLoja: true })
      .gestaoVendasDetalhadas({ de: '2026-01-01', ate: '2026-12-31' });

    expect(relatorio.guardar.mock.calls[0][1].total).toMatchObject({
      valor: moeda(52500),
    });
  });

  /**
   * PEDINDO AS DEVOLUCOES, o rodape volta a ser a soma do que esta na tela:
   * descontar ali subtrairia a devolucao DELA MESMA.
   *
   * A GARANTIA MORA NO REPOSITORIO, e nao aqui: `devolvidoNoMesmoRecorte`
   * devolve 0 quando o status e DEVOLVIDAS. O duble reproduz esse contrato —
   * devolver outra coisa testaria um mundo que nao existe.
   */
  it('na lista de devolucoes, o rodape e a soma das linhas', async () => {
    const { servico, relatorio } = montar([UMA_DEVOLUCAO], 0);

    await servico
      .montar({ verLoja: true })
      .gestaoVendasDetalhadas({
        somente: 'DEVOLVIDAS',
        de: '2026-01-01',
        ate: '2026-12-31',
      });

    expect(relatorio.guardar.mock.calls[0][1].total).toMatchObject({
      valor: moeda(-110460),
    });
  });
});
