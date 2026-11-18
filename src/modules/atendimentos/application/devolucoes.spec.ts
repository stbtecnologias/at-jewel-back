import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { moeda } from '../../../shared/formato/moeda';

/**
 * "QUANTAS PEÇAS DEVOLVIDAS EM NOVEMBRO?" — produção, 18/11/2026, 13:39.
 *
 * ==========================================================================
 * ELE PERGUNTOU UM NÚMERO E LEVOU UMA TABELA COM NOME DE CLIENTE.
 *
 *   — "Quantas peças devolvidas em Novembro de 2026"
 *   — "Em novembro de 2026 foram 3 peças devolvidas, somando R$ 32.966,00"
 *   — e logo abaixo, sozinha, a "Listagem de Vendas — novembro de 2026"
 *     com as três linhas, cliente por cliente.
 *
 * *"Pedi uma coisa.. acho que veio mais coisas.. só pedi devolução e veio
 * listagem de vendas?"*
 *
 * A AGENTE NÃO ESCOLHEU MANDAR A TABELA: não havia outra porta. Devolução só
 * existia dentro do `vendas_detalhadas`, e a descrição dele diz, na própria
 * linha, *"imprime a lista inteira sempre que é chamada"*. Quem perguntasse
 * QUANTAS levava as linhas junto, sempre.
 *
 * É o mesmo buraco que a consignação tinha até ontem — e o mesmo conserto:
 * uma ferramenta que responde em número e não imprime nada. Ver
 * [[consignacoes.spec.ts]].
 *
 * E A UNIDADE TEM DE VIR ESCRITA. "3 peças" eram 3 DOCUMENTOS; acertou por
 * coincidência, porque os três tinham uma peça cada. Em agosto de 2026 foram
 * 7 documentos e 8 peças — ali a mesma frase teria mentido.
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

describe('as devolucoes, em numero e sem tabela', () => {
  function montar(
    resposta: unknown,
    ctx: Record<string, unknown> = { verLoja: true },
  ) {
    const devolucoes = jest.fn().mockResolvedValue(resposta);
    const deps = Array.from({ length: 32 }, (_, i) =>
      naoParaTudo(`colaborador ${i}`),
    );
    deps[1] = { devolucoes } as never;
    const servico = new FerramentasGestaoService(
      ...(deps as unknown as ConstructorParameters<
        typeof FerramentasGestaoService
      >),
    );
    return { ferramentas: servico.montar(ctx as never), devolucoes };
  }

  /** Novembro de 2026, medido na cópia de produção. */
  const NOVEMBRO = {
    documentos: 3,
    pecas: 3,
    valor: 32966,
    periodo: 'de 01/11/2026 a 18/11/2026',
  };

  it('responde em uma linha, com as duas unidades escritas', async () => {
    const { ferramentas } = montar(NOVEMBRO);

    const r = await ferramentas.gestaoDevolucoes({ periodo: 'MES' });

    expect(r.status).toBe('OK');
    expect(r.periodo).toBe('de 01/11/2026 a 18/11/2026');
    expect(r.linhas).toEqual([
      `Devoluções de venda: 3 documentos — 3 peças, ${moeda(32966)}`,
    ]);
  });

  /**
   * O CAMPO VAZIO VIRA FRASE INVENTADA, e foi o padrão do dia 18/11 inteiro.
   *
   * Agosto de 2026: 7 documentos, 8 peças. Se a ferramenta mandar só um
   * número, a agente escolhe a palavra — e em novembro escolheu "peças" para
   * um número de documentos. As duas grandezas vão escritas, sempre.
   */
  it('documento e peça são grandezas diferentes, e as duas vão escritas', async () => {
    const { ferramentas } = montar({
      documentos: 7,
      pecas: 8,
      valor: 412300,
      periodo: 'de 01/08/2026 a 31/08/2026',
    });

    const r = await ferramentas.gestaoDevolucoes({
      de: '2026-08-01',
      ate: '2026-08-31',
    });

    expect(r.linhas).toEqual([
      `Devoluções de venda: 7 documentos — 8 peças, ${moeda(412300)}`,
    ]);
  });

  it('uma só devolução fala no singular', async () => {
    const { ferramentas } = montar({
      documentos: 1,
      pecas: 1,
      valor: 12526,
      periodo: 'de 01/10/2026 a 31/10/2026',
    });

    const r = await ferramentas.gestaoDevolucoes({ periodo: 'MES' });

    expect(r.linhas).toEqual([
      `Devoluções de venda: 1 documento — 1 peça, ${moeda(12526)}`,
    ]);
  });

  it('periodo sem devolucao nenhuma devolve lista vazia', async () => {
    const { ferramentas } = montar({
      documentos: 0,
      pecas: 0,
      valor: 0,
      periodo: 'de 01/04/2026 a 30/04/2026',
    });

    const r = await ferramentas.gestaoDevolucoes({ periodo: 'MES' });

    expect(r.status).toBe('OK');
    expect(r.linhas).toEqual([]);
  });

  /** A mesma trava da consignação: é movimento da loja. */
  it('quem nao alcanca loja nem equipe recebe INDISPONIVEL', async () => {
    const { ferramentas, devolucoes } = montar(NOVEMBRO, {
      verLoja: false,
      equipe: null,
    });

    const r = await ferramentas.gestaoDevolucoes({ periodo: 'MES' });

    expect(r.status).toBe('INDISPONIVEL');
    expect(r.linhas).toEqual([]);
    expect(devolucoes).not.toHaveBeenCalled();
  });
});
