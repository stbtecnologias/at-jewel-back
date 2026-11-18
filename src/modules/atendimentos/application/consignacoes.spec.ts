import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { moeda } from '../../../shared/formato/moeda';

/**
 * "QUANTAS CONSIGNAÇÕES TIVEMOS EM NOVEMBRO?" — 18/11/2026.
 *
 * ==========================================================================
 * O PEDIDO NASCEU DO CONSERTO, E NÃO APESAR DELE.
 *
 * Até 17/11 a consignação entrava como venda, e por isso a gestão nunca
 * precisou perguntar por ela: ela já estava — errada — no total. Tirá-la do
 * número de vendas abriu um buraco legítimo, e o Lucas o nomeou na hora:
 * *"podemos incluir ferramentas para ela consultar essas consignações:
 * 'Anastasia, quantas consignações tivemos no mês de novembro', 'e quantas já
 * foram devolvidas'"*.
 *
 * O VOLUME JUSTIFICA A FERRAMENTA. Em 01 a 17/11 foram 149 documentos e
 * R$ 52,6 milhões em mercadoria circulando — trinta vezes o que a loja
 * vendeu no mesmo período. É o maior movimento da casa, e até hoje não havia
 * como perguntar por ele.
 *
 * AS DUAS PONTAS NÃO SE SUBTRAEM, e é a primeira coisa que o formatador tem
 * de proteger: no histórico há 3.560 retornos contra 2.822 consignações.
 * Uma maleta sai num documento e volta em pedaços, em documentos diferentes.
 * Quem subtrair um do outro obtém um "em aberto" negativo que não existe.
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

describe('as consignacoes', () => {
  function montar(resposta: unknown, ctx: Record<string, unknown> = { verLoja: true }) {
    const consignacoes = jest.fn().mockResolvedValue(resposta);
    const deps = Array.from({ length: 32 }, (_, i) => naoParaTudo(`colaborador ${i}`));
    deps[1] = { consignacoes } as never;
    const servico = new FerramentasGestaoService(
      ...(deps as unknown as ConstructorParameters<typeof FerramentasGestaoService>),
    );
    return { ferramentas: servico.montar(ctx as never), consignacoes };
  }

  /** Os numeros reais de 01 a 17/11/2026, medidos na copia de producao. */
  const NOVEMBRO = {
    saidas: { quantidade: 69, valor: 26892660, pecas: 512 },
    retornos: { quantidade: 80, valor: 25750228, pecas: 498 },
    periodo: 'de 01/11/2026 a 17/11/2026',
  };

  it('responde as duas pontas, cada uma com o seu numero', async () => {
    const { ferramentas } = montar(NOVEMBRO);

    const r = await ferramentas.gestaoConsignacoes({ periodo: 'MES' });

    expect(r.status).toBe('OK');
    expect(r.linhas).toEqual([
      `Saíram em consignação: 69 — ${moeda(26892660)}`,
      `Voltaram: 80 — ${moeda(25750228)}`,
    ]);
  });

  /**
   * O "EM ABERTO" NAO SAI DAQUI, e a ausencia e deliberada: 80 − 69 da −11,
   * que lido como "onze a mais voltaram do que sairam" esta certo, e lido
   * como saldo de mercadoria esta errado. Os documentos nao casam um a um.
   */
  it('nao inventa um saldo subtraindo uma ponta da outra', async () => {
    const { ferramentas } = montar(NOVEMBRO);

    const r = await ferramentas.gestaoConsignacoes({ periodo: 'MES' });

    for (const linha of r.linhas) {
      expect(linha).not.toMatch(/aberto|saldo|pendente|em poder/i);
    }
  });

  it('periodo sem consignacao nenhuma devolve lista vazia', async () => {
    const { ferramentas } = montar({
      saidas: { quantidade: 0, valor: 0, pecas: 0 },
      retornos: { quantidade: 0, valor: 0, pecas: 0 },
      periodo: 'de 01/01/2020 a 31/01/2020',
    });

    const r = await ferramentas.gestaoConsignacoes({ periodo: 'MES' });

    expect(r.status).toBe('OK');
    expect(r.linhas).toEqual([]);
  });

  it('so uma ponta no periodo: a outra nao aparece como zero', async () => {
    const { ferramentas } = montar({
      saidas: { quantidade: 3, valor: 150000, pecas: 9 },
      retornos: { quantidade: 0, valor: 0, pecas: 0 },
      periodo: 'de 01/11/2026 a 02/11/2026',
    });

    const r = await ferramentas.gestaoConsignacoes({ periodo: 'MES' });

    expect(r.linhas).toEqual([`Saíram em consignação: 3 — ${moeda(150000)}`]);
  });

  /**
   * MESMA TRAVA DAS QUEBRAS: quem nao enxerga a loja nem a equipe nao recebe
   * a ferramenta. Consignacao e movimento de mercadoria da loja inteira.
   */
  it('quem nao alcanca loja nem equipe recebe INDISPONIVEL', async () => {
    const { ferramentas, consignacoes } = montar(NOVEMBRO, {
      verLoja: false,
      equipe: null,
    });

    const r = await ferramentas.gestaoConsignacoes({ periodo: 'MES' });

    expect(r.status).toBe('INDISPONIVEL');
    expect(r.linhas).toEqual([]);
    expect(consignacoes).not.toHaveBeenCalled();
  });
});
