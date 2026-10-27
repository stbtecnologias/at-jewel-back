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

function montar(vendas = [UMA_VENDA]) {
  const detalhadas = jest
    .fn()
    .mockResolvedValue({ vendas, total: vendas.length });
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
