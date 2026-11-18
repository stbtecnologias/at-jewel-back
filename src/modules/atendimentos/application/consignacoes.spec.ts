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
    saidas: { quantidade: 69, valor: 26892660, pecas: 294 },
    retornos: { quantidade: 80, valor: 25750228, pecas: 309 },
    emAberto: { pecas: 146, valor: 10406273, doPeriodo: 110 },
    periodo: 'de 01/11/2026 a 17/11/2026',
  };

  it('responde as duas pontas, cada uma com o seu numero', async () => {
    const { ferramentas } = montar(NOVEMBRO);

    const r = await ferramentas.gestaoConsignacoes({ periodo: 'MES' });

    expect(r.status).toBe('OK');
    expect(r.linhas).toEqual([
      `Saíram em consignação: 69 documentos — 294 peças, ${moeda(26892660)}`,
      `Voltaram: 80 documentos — 309 peças, ${moeda(25750228)}`,
      'Voltou mais do que saiu porque parte do que voltou tinha saído em meses anteriores: as duas linhas acima são o movimento do período, e não um saldo.',
      `Ainda fora, hoje (todo o histórico): 146 peças, ${moeda(10406273)}` +
        ' — sendo 110 que saíram neste período e 36 de meses anteriores',
    ]);
  });

  /**
   * O "EM ABERTO" EXISTE, MAS NAO E A SUBTRACAO — 18/11/2026.
   *
   * ======================================================================
   * EU PROIBI UMA PERGUNTA LEGITIMA, E FOI ERRO MEU.
   *
   * A primeira versao recusava "quanto esta em aberto" porque os DOCUMENTOS
   * nao casam: 80 retornos contra 69 consignacoes em novembro, e a maleta
   * sai num documento e volta em pedacos. Isso continua verdade, e 80 − 69
   * segue sem significado nenhum.
   *
   * Mas por PECA a conta fecha. Medido na copia em 18/11, no historico todo:
   *
   *   5.807 pecas ja sairam em consignacao
   *   5.640 voltaram inteiras
   *   1.591 viraram venda em algum momento
   *     146 AINDA FORA — R$ 10.406.273,00
   *
   * Recusar pergunta que tem resposta e o que mais empurra a agente a
   * improvisar: ela fica sem numero e com a pergunta na mao.
   *
   * E A TERCEIRA LINHA E UMA POSICAO, NAO UM PERIODO: "ainda fora HOJE" nao
   * depende da janela, e o rotulo tem de dizer isso — senao alguem soma o
   * em aberto de novembro com o de outubro.
   * ======================================================================
   */
  it('o em aberto nao e a diferenca entre as duas pontas', async () => {
    const { ferramentas } = montar(NOVEMBRO);

    const r = await ferramentas.gestaoConsignacoes({ periodo: 'MES' });
    const emAberto = r.linhas.find((l) => l.includes('Ainda fora'));

    expect(emAberto).toBeDefined();
    // 80 − 69 = 11, e nao 146. Sao contas diferentes, de proposito.
    expect(emAberto).not.toContain('11 peças');
    expect(emAberto).toContain('146 peças');
  });

  it('o em aberto diz que e de HOJE, e nao do periodo', async () => {
    const { ferramentas } = montar(NOVEMBRO);

    const r = await ferramentas.gestaoConsignacoes({ periodo: 'MES' });

    const linha = r.linhas.find((l) => l.includes('Ainda fora'));
    expect(linha).toContain('hoje');
    // E QUE E O HISTORICO INTEIRO, e nao o periodo: em 18/11 as 146 pecas
    // fora vinham de 11/2026 (110), 10/2026 (9), 07/2026 (12) e ate de
    // 02/2024. Sem dizer isso, 69 saiu / 80 voltou / 146 fora nao fecha na
    // cabeca de quem le — foi a leitura do Lucas em 18/11.
    expect(linha).toContain('todo o histórico');
    // E A PONTE: sem ela, 294 saíram / 309 voltaram / 146 fora não fecha.
    expect(linha).toContain('110 que saíram neste período');
    expect(linha).toContain('36 de meses anteriores');
  });

  it('sem nada fora, a linha nao aparece', async () => {
    const { ferramentas } = montar({
      ...NOVEMBRO,
      emAberto: { pecas: 0, valor: 0, doPeriodo: 0 },
    });

    const r = await ferramentas.gestaoConsignacoes({ periodo: 'MES' });

    expect(r.linhas.some((l) => l.includes('Ainda fora'))).toBe(false);
  });

  it('periodo sem consignacao nenhuma devolve lista vazia', async () => {
    const { ferramentas } = montar({
      saidas: { quantidade: 0, valor: 0, pecas: 0 },
      retornos: { quantidade: 0, valor: 0, pecas: 0 },
      emAberto: { pecas: 0, valor: 0, doPeriodo: 0 },
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
      emAberto: { pecas: 0, valor: 0, doPeriodo: 0 },
      periodo: 'de 01/11/2026 a 02/11/2026',
    });

    const r = await ferramentas.gestaoConsignacoes({ periodo: 'MES' });

    expect(r.linhas).toEqual([
      `Saíram em consignação: 3 documentos — 9 peças, ${moeda(150000)}`,
    ]);
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
