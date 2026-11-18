import { FerramentasVendedoraService } from './ferramentas-vendedora.service';
import { moeda } from '../../../shared/formato/moeda';

/**
 * ==========================================================================
 * O NÚMERO CERTO COM A PALAVRA ERRADA — 18/11/2026.
 *
 * Medido na cópia de produção, de 01 a 18/11, pelos dois canais:
 *
 *   "quanto a Bianca vendeu"  (Anastasia) -> 6 vendas, R$ 381.150,80
 *   "quanto eu vendi"         (HELENA)    -> 6 vendas, R$ 381.150,80
 *
 * Os números batem, e isso foi consertado hoje de manhã: o
 * `ConsultarDesempenhoVendedoraUseCase` passou a aplicar `vendaLimpa`.
 *
 * O QUE SOBROU FOI A PALAVRA. A frase da Helena dizia
 * *"R$ 381.150,80 em RECEITA"*, e não é receita: é a venda limpa, sem abater
 * devolução. Receita é o líquido, que para o mesmo período dá
 * R$ 368.624,80 — outro número, com outro nome, e nenhum dos dois ia escrito
 * na frase.
 *
 * O campo do `VendasDoPeriodo` ainda se chama `receita` por herança, e o
 * texto repetia o nome do campo. É o defeito do dia inteiro na sua forma
 * mais barata: o rótulo errado vira a frase da agente.
 * ==========================================================================
 */

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

/** A Bianca de 01 a 18/11, medida na cópia de produção. */
const BIANCA = {
  quantidade: 6,
  receita: 381150.8,
  ticketMedio: 63525.13,
};

function montar() {
  const desempenho = {
    vendas: jest.fn().mockResolvedValue(BIANCA),
    vendasEntre: jest.fn().mockResolvedValue(BIANCA),
  };
  const deps = Array.from({ length: 24 }, (_, i) =>
    naoParaTudo(`colaborador ${i}`),
  );
  // O `desempenho` e o SEGUNDO parametro do construtor.
  deps[1] = desempenho as never;

  const servico = new FerramentasVendedoraService(
    ...(deps as unknown as ConstructorParameters<
      typeof FerramentasVendedoraService
    >),
  );
  return {
    ferramentas: servico.montar({ vendedoraId: 'vd-1' } as never),
    desempenho,
  };
}

describe('o que a Helena chama de valor', () => {
  /* ESTE É O TESTE. */
  it('fala em VENDAS, e não em receita', async () => {
    const { ferramentas } = montar();

    const r = await ferramentas.consultarVendas({ periodo: 'MES' });

    // A MESMA FRASE DA ANASTASIA, palavra por palavra: dois canais que
    // dizem o mesmo numero com a mesma frase nao tem como divergir.
    expect(r.resumo).toBe(
      `6 vendas, ${moeda(381150.8)}, ticket médio ${moeda(63525.13)}`,
    );
    // RECEITA É OUTRO NÚMERO: o líquido do mesmo período é
    // R$ 368.624,80, porque desconta a devolução de R$ 12.526,00.
    expect(r.resumo).not.toContain('receita');
  });

  it('e o número é o mesmo que a Anastasia dá para a mesma pessoa', async () => {
    const { ferramentas } = montar();

    const r = await ferramentas.consultarVendas({ periodo: 'MES' });

    // A frase da gestão, medida no mesmo período:
    //   "6 vendas, R$ 381.150,80, ticket médio R$ 63.525,13"
    expect(r.resumo).toContain('6 vendas');
    expect(r.resumo).toContain(moeda(381150.8));
  });

  it('pelas datas livres, a mesma palavra', async () => {
    const { ferramentas } = montar();

    const r = await ferramentas.consultarVendas({
      de: '2026-11-01',
      ate: '2026-11-18',
    });

    expect(r.resumo).toContain(moeda(381150.8));
    expect(r.resumo).not.toContain('receita');
  });

  it('sem venda nenhuma, segue dizendo que não houve', async () => {
    const { ferramentas, desempenho } = montar();
    desempenho.vendas.mockResolvedValue({
      quantidade: 0,
      receita: 0,
      ticketMedio: 0,
    });

    const r = await ferramentas.consultarVendas({ periodo: 'MES' });

    expect(r.resumo).toBe('nenhuma venda concluída nesse período');
  });
});
