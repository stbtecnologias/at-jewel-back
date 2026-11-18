import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { moeda } from '../../../shared/formato/moeda';

/**
 * A FERRAMENTA TEM DE DIZER QUE PERÍODO MEDIU — 18/11/2026.
 *
 * ==========================================================================
 * "FALEI ESSE MÊS. POR QUE OS 30 DIAS???"
 *
 * Às 11:11, no local, com os números já corrigidos:
 *
 *   — "Quanto a Bianca vendeu esse mês?"
 *   — "A Bianca fez 6 vendas NOS ÚLTIMOS 30 DIAS, somando R$ 381.150,80."
 *
 * Os números estavam certos — 381.150,80 é exatamente o que a cópia de
 * produção dá para 01 a 18/11 — e a janela também: `MES` é `setDate(1)`, ou
 * seja, do dia primeiro até agora. O que não existia era a INFORMAÇÃO de
 * qual janela foi usada.
 *
 * O texto que ia ao modelo era só isto:
 *
 *   Bianca:
 *   - 6 vendas, R$ 381.150,80 em receita, ticket médio R$ 63.525,13
 *   Repasse os nomes, horários e números exatamente como estão.
 *
 * Ele repassou os números exatamente como estavam — e inventou a moldura,
 * porque ninguém a deu. UM BURACO NA INSTRUÇÃO VIRA UMA FRASE INVENTADA, e
 * o pior é que a frase inventada soa igual às verdadeiras.
 *
 * O conserto reusa o `valorDasVendas`, que já devolve o rótulo do período —
 * e, de brinde, "quanto a loja vendeu" e "quanto a Bianca vendeu" passam a
 * correr pelo MESMO caminho, com a mesma regra de venda limpa.
 * ==========================================================================
 */

function naoParaTudo(nome: string) {
  return new Proxy(
    {},
    {
      get() {
        return () => {
          throw new Error(`${nome} nao deveria ser chamado`);
        };
      },
    },
  );
}

describe('as vendas de uma vendedora dizem o periodo', () => {
  function montar(valor: unknown) {
    const valorDasVendas = jest.fn().mockResolvedValue(valor);
    const resolver = jest.fn().mockResolvedValue({
      status: 'OK',
      id: 'vd-1',
      nome: 'Bianca',
      codigoErp: null,
    });
    const deps = Array.from({ length: 32 }, (_, i) => naoParaTudo(`colaborador ${i}`));
    deps[0] = { execute: resolver } as never;
    deps[1] = { valorDasVendas } as never;
    const servico = new FerramentasGestaoService(
      ...(deps as unknown as ConstructorParameters<typeof FerramentasGestaoService>),
    );
    return { ferramentas: servico.montar({ verLoja: true } as never), valorDasVendas };
  }

  const BIANCA = {
    quantidade: 6,
    bruto: 381150.8,
    devolucoes: 1,
    valorDevolvido: 12526,
    receita: 368624.8,
    ticketMedio: 63525.13,
    clientes: 5,
    periodo: 'de 01/11/2026 a 18/11/2026',
  };

  /* ESTE É O TESTE. */
  it('o periodo vem no resultado, para o modelo nao inventar a moldura', async () => {
    const { ferramentas } = montar(BIANCA);

    const r = await ferramentas.gestaoVendas({
      vendedora: 'Bianca',
      periodo: 'MES',
    });

    expect(r.periodo).toBe('de 01/11/2026 a 18/11/2026');
  });

  it('a linha traz a venda limpa, e nao a receita', async () => {
    const { ferramentas } = montar(BIANCA);

    const r = await ferramentas.gestaoVendas({
      vendedora: 'Bianca',
      periodo: 'MES',
    });

    expect(r.linhas).toEqual([
      `6 vendas, ${moeda(381150.8)}, ticket médio ${moeda(63525.13)}`,
    ]);
  });

  /**
   * O RECORTE TEM DE CHEGAR À CONSULTA COMO LISTA DE UMA: é o mesmo
   * parâmetro que a gerente de vendas usa para ver só o time dela, e passar
   * o id errado aqui devolveria a loja inteira com o nome da Bianca em cima.
   */
  it('consulta filtrada so nela', async () => {
    const { ferramentas, valorDasVendas } = montar(BIANCA);

    await ferramentas.gestaoVendas({ vendedora: 'Bianca', periodo: 'MES' });

    const args = valorDasVendas.mock.calls[0];
    expect(args[0]).toBe('MES');
    expect(args[4]).toEqual(['vd-1']);
  });

  it('sem venda no periodo, nao inventa linha', async () => {
    const { ferramentas } = montar({ ...BIANCA, quantidade: 0, bruto: 0 });

    const r = await ferramentas.gestaoVendas({
      vendedora: 'Bianca',
      periodo: 'MES',
    });

    expect(r.linhas).toEqual([]);
  });
});
