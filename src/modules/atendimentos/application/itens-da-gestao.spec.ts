import { FerramentasGestaoService } from './ferramentas-gestao.service';

/**
 * O ESCOPO ESTREITO DA GESTAO — 29/09/2026.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE: QUEM GERENCIA AS VENDEDORAS NAO VE A LOJA.
 *
 * Pedido do Lucas: uma gerente das vendedoras, que ve desempenho, metas,
 * agenda e catalogo da equipe, e NAO ve o faturamento geral.
 *
 * Das 17 ferramentas da gestao, dezesseis falam de UMA vendedora ou nao falam
 * de dinheiro. So o `itens_mais_vendidos` responde sobre a loja inteira, em
 * valor, quando a vendedora e omitida — entao e a unica que muda, e o que
 * muda e a obrigatoriedade do nome.
 *
 * O padrao de `verLoja` e FALSO de proposito: quem esquecer de informar perde
 * uma resposta, e nao abre o faturamento. O primeiro teste guarda exatamente
 * isso, e ele quebra se alguem inverter o default por conveniencia.
 * ==========================================================================
 */

const MARINA = {
  status: 'OK' as const,
  id: 'vd-1',
  nome: 'Marina',
  codigoErp: 'SEED-VD01',
};

describe('itens_mais_vendidos e o escopo de quem pergunta', () => {
  let resolverVendedora: { execute: jest.Mock };
  let consultarVendas: { itens: jest.Mock };
  let listarProdutos: { execute: jest.Mock };
  let servico: FerramentasGestaoService;

  beforeEach(() => {
    resolverVendedora = { execute: jest.fn().mockResolvedValue(MARINA) };
    listarProdutos = {
      execute: jest.fn().mockResolvedValue([
        {
          descricaoEtiqueta: 'Anel solitário',
          categoria: 'JOIAS',
          familia: 'ANEL',
          codigoErp: 'AN25258',
          valorVenda: 17490,
          estoqueAtual: 4,
        },
      ]),
    };
    consultarVendas = {
      itens: jest.fn().mockResolvedValue({
        linhas: [
          {
            codigoErp: 'AN25258',
            descricao: 'Anel solitario',
            familia: 'ANEL',
            valor: 17490,
            quantidade: 1,
          },
        ],
      }),
    };

    servico = new FerramentasGestaoService(
      resolverVendedora as never,
      consultarVendas as never,
      listarProdutos as never,
      { execute: jest.fn() } as never,
      { vendas: jest.fn(), metas: jest.fn() } as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), detalhe: jest.fn(), resumo: jest.fn() } as never,
      { doDia: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), buscarPorId: jest.fn() } as never,
      { buscarPorNomeParcial: jest.fn() } as never,
      { listarAguardandoGestao: jest.fn() } as never,
    );
  });

  describe('sem ver a loja (GERENTE_VENDAS)', () => {
    it('o padrao do montar ja e o escopo estreito — esquecer nao abre nada', () => {
      expect(servico.montar().gestaoItensExigeVendedora).toBe(true);
      expect(servico.montar({}).gestaoItensExigeVendedora).toBe(true);
      expect(
        servico.montar({ solicitante: 'Fernanda' }).gestaoItensExigeVendedora,
      ).toBe(true);
    });

    it('sem vendedora, NAO consulta — e pede o nome, em vez de dizer que nao achou', async () => {
      const r = await servico
        .montar({ verLoja: false })
        .gestaoItens({ periodo: 'MES' });

      expect(r.status).toBe('EXIGE_VENDEDORA');
      // O ponto do teste: o SQL da loja nao chega a rodar. Recusar depois de
      // consultar deixaria o dado carregado em memoria, a um `return` de
      // distancia de vazar numa refatoracao.
      expect(consultarVendas.itens).not.toHaveBeenCalled();
    });

    it('vendedora em branco conta como ausente', async () => {
      const r = await servico
        .montar({ verLoja: false })
        .gestaoItens({ periodo: 'MES', vendedora: '   ' });

      expect(r.status).toBe('EXIGE_VENDEDORA');
      expect(consultarVendas.itens).not.toHaveBeenCalled();
    });

    it('COM vendedora responde normalmente, recortado nela', async () => {
      const r = await servico
        .montar({ verLoja: false })
        .gestaoItens({ periodo: 'MES', vendedora: 'Marina' });

      expect(r.status).toBe('OK');
      expect(r.linhas[0]).toContain('Anel solitario');
      // O terceiro argumento e o recorte: o id da vendedora resolvida, nunca
      // `null` — que aqui significaria a loja.
      expect(consultarVendas.itens).toHaveBeenCalledWith('MES', 10, 'vd-1');
    });
  });

  describe('vendo a loja (ADMIN, GERENTE, SUPERADMIN)', () => {
    it('sem vendedora, responde pela loja', async () => {
      const r = await servico
        .montar({ verLoja: true })
        .gestaoItens({ periodo: 'MES' });

      expect(r.status).toBe('OK');
      expect(consultarVendas.itens).toHaveBeenCalledWith('MES', 10, null);
    });

    it('avisa o cliente do LLM que a tool NAO precisa exigir vendedora', () => {
      expect(
        servico.montar({ verLoja: true }).gestaoItensExigeVendedora,
      ).toBe(false);
    });
  });
});

/**
 * A QUANTIDADE POR PECA NA CONSULTA DE CATALOGO — 29/09/2026.
 *
 * ==========================================================================
 * ISTO REVERTE UMA DECISAO DE 25/09, E A REVERSAO E O PONTO.
 *
 * Naquele dia ficou "a gestao pode ver o numero", valendo para todo mundo que
 * entrasse no canal. O documento de requisitos de 28/09 desfez na pendencia
 * P-04, e o Lucas confirmou: a gerente "tem que entender se a peca que ela
 * quer esta disponivel no estoque e quanto e o preco de venda. Ela nao precisa
 * saber de quantidade".
 *
 * Quem mexer aqui procurando o historico: a decisao velha esta em 25/09, a
 * nova em 28/09, e a chave e `estoque:quantidade` — a MESMA da API de
 * produtos, para nao existirem dois criterios para a mesma pergunta.
 * ==========================================================================
 */
describe('consultar_produtos da gestao e a quantidade', () => {
  let listarProdutos: { execute: jest.Mock };
  let servico: FerramentasGestaoService;

  const comEstoque = (estoqueAtual: number) => {
    listarProdutos.execute.mockResolvedValue([
      {
        descricaoEtiqueta: 'Anel solitário',
        categoria: 'JOIAS',
        familia: 'ANEL',
        codigoErp: 'AN25258',
        valorVenda: 17490,
        estoqueAtual,
      },
    ]);
  };

  beforeEach(() => {
    listarProdutos = { execute: jest.fn() };
    servico = new FerramentasGestaoService(
      { execute: jest.fn() } as never,
      { itens: jest.fn() } as never,
      listarProdutos as never,
      { execute: jest.fn() } as never,
      { vendas: jest.fn(), metas: jest.fn() } as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), detalhe: jest.fn(), resumo: jest.fn() } as never,
      { doDia: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), buscarPorId: jest.fn() } as never,
      { buscarPorNomeParcial: jest.fn() } as never,
      { listarAguardandoGestao: jest.fn() } as never,
    );
  });

  const linha = async (verQuantidade?: boolean) => {
    comEstoque(4);
    const r = await servico
      .montar(verQuantidade === undefined ? {} : { verQuantidade })
      .gestaoProdutos({ busca: 'anel' });
    return r.produtos[0].linha;
  };

  describe('sem `estoque:quantidade` — a gerente', () => {
    it('diz "disponível", e nao ha numero de saldo na frase', async () => {
      const texto = await linha(false);

      expect(texto).toContain('disponível');
      // O PADRAO, e nao o digito: o preco (R$ 17.490) e o codigo (AN25258)
      // tambem tem numeros, entao `not.toContain('4')` falharia por eles e nao
      // pelo saldo. O que nao pode existir e "<numero> em estoque".
      expect(texto).not.toMatch(/\d+\s*(un|peç|em estoque)/i);
    });

    it('o preco de venda continua saindo — e o que ela precisa para atender', async () => {
      expect(await linha(false)).toContain('17.490');
    });

    it('a frase NAO anuncia que existe um numero escondido', async () => {
      const texto = await linha(false);

      // "disponível (quantidade restrita)" seria pior que o silêncio: convida
      // a insistir, e a insistência não leva a lugar nenhum.
      expect(texto.toLowerCase()).not.toContain('restrit');
      expect(texto.toLowerCase()).not.toContain('permiss');
    });

    it('sem saldo continua dizendo "sem estoque" — a resposta util e a mesma', async () => {
      comEstoque(0);
      const r = await servico
        .montar({ verQuantidade: false })
        .gestaoProdutos({ busca: 'anel' });

      expect(r.produtos[0].linha).toContain('sem estoque');
    });

    it('o padrao do montar ja e o restrito', async () => {
      // Mesma regra do `verLoja`: esquecer de informar tira uma informacao,
      // nao abre uma.
      expect(await linha()).toContain('disponível');
    });
  });

  describe('com `estoque:quantidade` — a Equipe AT', () => {
    it('o numero volta', async () => {
      expect(await linha(true)).toContain('4 em estoque');
    });
  });
});

/**
 * O RECORTE DE EQUIPE NAS FERRAMENTAS DA ANASTASIA — RF-06 e RF-08.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE: AS DUAS PORTAS CONCORDAM.
 *
 * A tela de Vendas ja recortava por equipe pelo `EscopoVendasService`. Se o
 * WhatsApp nao recortasse, a MESMA pergunta teria resposta diferente conforme
 * a porta — o sintoma que o codigo deste projeto avisa em varios lugares para
 * nao deixar acontecer, porque ninguem descobre olhando uma tela so.
 *
 * `null` = sem equipe = alcanca todas. E o estado de todo mundo hoje, e por
 * isso este recorte entrou sem mudar comportamento de ninguem.
 * ==========================================================================
 */
describe('o recorte de equipe nas ferramentas de gestao', () => {
  const MARINA_ID = 'vd-1';
  const DE_FORA_ID = 'vd-9';

  let resolverVendedora: { execute: jest.Mock };
  let vendedoras: { listar: jest.Mock; buscarPorId: jest.Mock };
  let desempenho: { vendas: jest.Mock; metas: jest.Mock };
  let servico: FerramentasGestaoService;

  beforeEach(() => {
    resolverVendedora = { execute: jest.fn() };
    vendedoras = {
      listar: jest.fn().mockResolvedValue([
        { id: MARINA_ID, nome: 'Marina', statusDisponibilidade: 'DISPONIVEL', especialidades: [] },
        { id: DE_FORA_ID, nome: 'Beatriz', statusDisponibilidade: 'DISPONIVEL', especialidades: [] },
      ]),
      buscarPorId: jest.fn(),
    };
    desempenho = {
      vendas: jest
        .fn()
        .mockResolvedValue({ quantidade: 2, receita: 1000, ticketMedio: 500 }),
      metas: jest.fn(),
    };

    servico = new FerramentasGestaoService(
      resolverVendedora as never,
      { itens: jest.fn().mockResolvedValue({ linhas: [] }) } as never,
      { execute: jest.fn().mockResolvedValue([]) } as never,
      { execute: jest.fn().mockResolvedValue([]) } as never,
      desempenho as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), detalhe: jest.fn(), resumo: jest.fn() } as never,
      { doDia: jest.fn() } as never,
      { execute: jest.fn() } as never,
      vendedoras as never,
      { buscarPorNomeParcial: jest.fn() } as never,
      { listarAguardandoGestao: jest.fn() } as never,
    );
  });

  const soMarina = { equipe: [MARINA_ID] };

  describe('vendas_de_vendedora', () => {
    it('responde pela vendedora DA equipe', async () => {
      resolverVendedora.execute.mockResolvedValue({
        status: 'OK', id: MARINA_ID, nome: 'Marina', codigoErp: 'VD01',
      });

      const r = await servico.montar(soMarina).gestaoVendas({
        vendedora: 'Marina', periodo: 'MES',
      });

      expect(r.status).toBe('OK');
    });

    it('vendedora de FORA responde "nao encontrada" — e nao "sem permissao"', async () => {
      resolverVendedora.execute.mockResolvedValue({
        status: 'OK', id: DE_FORA_ID, nome: 'Beatriz', codigoErp: 'VD09',
      });

      const r = await servico.montar(soMarina).gestaoVendas({
        vendedora: 'Beatriz', periodo: 'MES',
      });

      // A gerente de um time nao precisa saber quem esta no outro: dizer
      // "voce nao pode ver a Beatriz" confirmaria que a Beatriz existe.
      expect(r.status).toBe('NAO_ENCONTRADA');
      expect(desempenho.vendas).not.toHaveBeenCalled();
    });

    it('e as SUGESTOES tambem vem vazias', async () => {
      // Devolver "voce quis dizer Beatriz?" entregaria pela lista o que a
      // recusa acabou de esconder.
      resolverVendedora.execute.mockResolvedValue({
        status: 'OK', id: DE_FORA_ID, nome: 'Beatriz', codigoErp: 'VD09',
      });

      const r = await servico.montar(soMarina).gestaoVendas({
        vendedora: 'Beatriz', periodo: 'MES',
      });

      expect(r.nomes).toEqual([]);
    });

    it('sem equipe, alcanca todas — o comportamento historico', async () => {
      resolverVendedora.execute.mockResolvedValue({
        status: 'OK', id: DE_FORA_ID, nome: 'Beatriz', codigoErp: 'VD09',
      });

      const r = await servico.montar({}).gestaoVendas({
        vendedora: 'Beatriz', periodo: 'MES',
      });

      expect(r.status).toBe('OK');
    });
  });

  describe('panorama_da_equipe', () => {
    it('lista so as da equipe', async () => {
      const r = await servico.montar(soMarina).gestaoPanorama({ periodo: 'MES' });

      expect(r.linhas).toHaveLength(1);
      expect(r.linhas[0]).toContain('Marina');
      expect(r.linhas[0]).not.toContain('Beatriz');
    });

    it('sem equipe, lista as duas', async () => {
      const r = await servico.montar({}).gestaoPanorama({ periodo: 'MES' });

      expect(r.linhas).toHaveLength(2);
    });
  });

  describe('listar_vendedoras', () => {
    it('oferece so quem a gerente alcanca', async () => {
      // Oferecer um nome de outro time faria ela encaminhar para fora do
      // alcance, e o erro so apareceria depois.
      const r = await servico.montar(soMarina).gestaoVendedoras();

      expect(r.linhas).toEqual(['Marina']);
    });
  });

  describe('equipe VAZIA', () => {
    it('nao alcanca ninguem — e nao vira "todas"', async () => {
      const r = await servico.montar({ equipe: [] }).gestaoPanorama({ periodo: 'MES' });

      expect(r.linhas).toEqual([]);
    });
  });
});
