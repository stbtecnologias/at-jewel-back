import { FerramentasGestaoService } from './ferramentas-gestao.service';
import { FerramentasVendedoraService } from './ferramentas-vendedora.service';
import type { Lead } from '../../leads/domain/ports/repositories/lead-repository.port';
import {
  chegadaLegivel,
  linhaDoLead,
} from '../../leads/application/leads-em-lista';

/**
 * A LEITURA DE LEAD PELAS DUAS AGENTES — 21/09/2026.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE.
 *
 * 1. A VENDEDORA SO ALCANCA O QUE FOI ENCAMINHADO PARA ELA. Decisao do Lucas:
 *    "a vendedora recebe apenas o que foi encaminhado para ela". Como no resto
 *    do canal, isso e ausencia de caminho — a ferramenta nao tem parametro de
 *    pessoa, e o codigo dela vai no filtro.
 *
 * 2. SEM CODIGO NAO E "SEM LEAD". Vendedora sem `codigo_erp` (existe migracao
 *    so para isso) nao tem como ser filtrada. Devolver lista vazia faria a
 *    agente dizer "voce nao tem lead nenhum", que e mentira.
 *
 * 3. O TELEFONE VAI NOS DOIS CANAIS. Sem ele a vendedora nao alcanca o lead, e
 *    a gestao pediu para ver tudo.
 * ==========================================================================
 */

function lead(nome: string, parcial: Partial<Lead> = {}): Lead {
  return {
    id: 'l-' + nome,
    nome,
    apelido: null,
    whatsapp: '5585984901180',
    origemContato: 'instagram',
    ocasiao: 'NOIVADO',
    produtosDesejados: 'anel de noivado classico',
    resumoTriagem: 'resumo longo que NAO entra na lista',
    vendedoraSugeridaCodigo: null,
    estado: 'IN_HUMAN_SERVICE',
    estadoAtualizadoEm: new Date(),
    clienteId: null,
    vinculadoEm: null,
    direcionadoGestaoEm: new Date(),
    vendedoraAprovadaCodigo: 'SEED-VD01',
    direcionadoVendedoraEm: new Date(),
    fechadoEm: new Date(),
    statusVendedora: null,
    statusVendedoraEm: null,
    observacaoVendedora: null,
    criadoEm: new Date(),
    ...parcial,
  };
}

describe('os leads da vendedora (Elena)', () => {
  let leads: { listarPorVendedora: jest.Mock };
  let agendar: { execute: jest.Mock };
  let statusLead: { execute: jest.Mock };
  let servico: FerramentasVendedoraService;

  beforeEach(() => {
    leads = { listarPorVendedora: jest.fn().mockResolvedValue([]) };
    agendar = { execute: jest.fn() };
    statusLead = {
      execute: jest.fn().mockResolvedValue({
        status: 'ATUALIZADO',
        lead: lead('Aslan'),
        vinculo: 'NAO_SE_APLICA',
      }),
    };
    servico = new FerramentasVendedoraService(
      { execute: jest.fn() } as never,
      { vendas: jest.fn(), metas: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      agendar as never,
      { execute: jest.fn() } as never,
      { resumo: jest.fn() } as never,
      leads as never,
      statusLead as never,
    );
  });

  const montar = (codigoErp: string | null = 'SEED-VD01') =>
    servico.montar({ vendedoraId: 'vd-1', codigoErp });

  it('NAO ACEITA "de quem" — a ferramenta nao tem parametro', () => {
    expect(montar().consultarMeusLeads.length).toBe(0);
  });

  it('filtra pelo codigo DELA, que veio por closure', async () => {
    leads.listarPorVendedora.mockResolvedValue([lead('Aslan')]);

    const r = await montar().consultarMeusLeads();

    expect(leads.listarPorVendedora).toHaveBeenCalledWith(
      'SEED-VD01',
      expect.any(Number),
    );
    expect(r.status).toBe('OK');
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toContain('Aslan');
    expect(r.linhas[0]).toContain('anel de noivado classico');
    expect(r.linhas[0]).toContain('para noivado');
    // O TELEFONE VAI, formatado para ela digitar no teclado.
    expect(r.linhas[0]).toContain('(85)');
    // O resumo longo da triagem NAO entra na lista.
    expect(r.linhas[0]).not.toContain('resumo longo');
  });

  /**
   * ==========================================================================
   * A LISTA E FILA, E NAO HISTORICO — migracao 60, 22/09/2026.
   *
   * O defeito que este teste trava foi visto pelo Lucas: "pq toda vez que ela
   * quiser saber os leads dela sempre vai vir uma lista enorme, pq nunca da
   * baixa, e isso?".
   *
   * Era isso: `listarPorVendedora` filtrava SO pelo codigo dela. O teto de 10
   * escondia o problema por acidente — "os 10 mais recentes" nao e "o que eu
   * preciso atender", e um lead de tres semanas que ela nunca ligou sumia da
   * lista sem ninguem notar, porque nada o distinguia de um resolvido.
   * ==========================================================================
   */
  it('a lista traz so o que ainda esta com ela', async () => {
    leads.listarPorVendedora.mockResolvedValue([lead('Aslan')]);

    await montar().consultarMeusLeads();

    // O terceiro argumento ausente = `apenasAbertos` no padrao, que e `true`.
    // Este teste morre no dia em que alguem passar `false` aqui.
    const [, , apenasAbertos] = leads.listarPorVendedora.mock.calls[0];
    expect(apenasAbertos).toBeUndefined();
  });

  it('sem codigo de vendedora, diz que NAO DA PARA SABER — nao "nao tem"', async () => {
    const r = await montar(null).consultarMeusLeads();

    expect(r.status).toBe('SEM_CODIGO');
    expect(leads.listarPorVendedora).not.toHaveBeenCalled();
  });

  /**
   * ==========================================================================
   * AGENDAR UM LEAD NAO DA, E A RESPOSTA TEM DE DIZER POR QUE — 22/09/2026.
   *
   * A conversa que originou isto:
   *
   *   Elena:  "Tem um lead sim, Lucas: Aslan ... Quer que eu já agende
   *            um contato com ele?"
   *   Lucas:  "agende para hoje as 10:30"
   *   Elena:  "Você quer que eu marque com qual cliente às 10:30?"
   *
   * A oferta nao existia em ferramenta nenhuma — o modelo a inventou, porque
   * ha uma ferramenta de agendar e um lead parece gente. Agendar exige
   * cliente (`atendimentos.cliente_id` e NOT NULL) e lead nao e cliente.
   *
   * A oferta foi barrada no prompt, mas prompt e barreira mole. Estes testes
   * travam o ramo de CODIGO, que e o que responde certo mesmo quando o modelo
   * tenta assim mesmo.
   * ==========================================================================
   */
  describe('quando pedem para agendar um LEAD', () => {
    beforeEach(() => {
      // O cliente nao existe na carteira — e o que o use case devolveria.
      agendar.execute.mockResolvedValue({ status: 'CLIENTE_NAO_ENCONTRADO' });
    });

    it('diz que e LEAD, e nao "nao encontrei esse cliente"', async () => {
      leads.listarPorVendedora.mockResolvedValue([lead('Aslan')]);

      const r = await montar().agendarContato({
        cliente: 'Aslan',
        quandoIso: '2026-09-22T10:30:00-03:00',
      });

      expect(r.status).toBe('E_LEAD');
      expect(r.mensagem).toContain('Aslan');
      expect(r.mensagem).toContain('LEAD');
      // O ponto inteiro: a agente NAO pode dizer que marcou.
      expect(r.mensagem).toContain('NÃO prometa marcar');
    });

    it('acha o lead pelo primeiro nome, como ela escreve', async () => {
      leads.listarPorVendedora.mockResolvedValue([lead('Aslan Ferreira')]);

      const r = await montar().agendarContato({
        cliente: 'aslan',
        quandoIso: '2026-09-22T10:30:00-03:00',
      });

      expect(r.status).toBe('E_LEAD');
      expect(r.mensagem).toContain('Aslan Ferreira');
    });

    /** Nome que nao e lead nenhum continua com a negativa generica de sempre. */
    it('cliente que nao existe em lugar nenhum segue como antes', async () => {
      leads.listarPorVendedora.mockResolvedValue([lead('Aslan')]);

      const r = await montar().agendarContato({
        cliente: 'Fulana de Tal',
        quandoIso: '2026-09-22T10:30:00-03:00',
      });

      expect(r.status).toBe('CLIENTE_NAO_ENCONTRADO');
      expect(r.mensagem).toContain('carteira dela');
    });

    /** Sem codigo nao ha lead para consultar — e nao se inventa uma busca. */
    it('sem codigo de vendedora nao consulta lead nenhum', async () => {
      const r = await montar(null).agendarContato({
        cliente: 'Aslan',
        quandoIso: '2026-09-22T10:30:00-03:00',
      });

      expect(r.status).toBe('CLIENTE_NAO_ENCONTRADO');
      expect(leads.listarPorVendedora).not.toHaveBeenCalled();
    });

    /** Agendamento que DEU CERTO nao passa nem perto da busca de lead. */
    it('cliente de verdade agenda normal, sem consultar leads', async () => {
      agendar.execute.mockResolvedValue({
        status: 'AGENDADO',
        cliente: 'Helena Prado',
        quando: new Date(2026, 8, 22, 10, 30),
      });

      const r = await montar().agendarContato({
        cliente: 'Helena',
        quandoIso: '2026-09-22T10:30:00-03:00',
      });

      expect(r.status).toBe('AGENDADO');
      expect(leads.listarPorVendedora).not.toHaveBeenCalled();
    });
  });

  /**
   * ==========================================================================
   * A BAIXA NO LEAD — migracao 60, 22/09/2026.
   *
   * Nasceu da pergunta do Lucas: "pq toda vez que ela quiser saber os leads
   * dela sempre vai vir uma lista enorme, pq nunca da baixa, e isso?".
   *
   * Esta e a PRIMEIRA ESCRITA da vendedora sobre lead, e por isso os testes
   * aqui cobrem coisa diferente dos de leitura: o que a frase de volta AFIRMA.
   * ==========================================================================
   */
  describe('dar baixa no lead', () => {
    beforeEach(() => {
      leads.listarPorVendedora.mockResolvedValue([lead('Aslan')]);
    });

    it('NAO ACEITA "de quem" — o codigo dela vai por closure', async () => {
      await montar().atualizarLead({ lead: 'Aslan', status: 'NAO_VINGOU' });

      expect(statusLead.execute).toHaveBeenCalledWith(
        expect.objectContaining({ vendedoraCodigo: 'SEED-VD01' }),
      );
    });

    it('acha o lead pelo nome e manda o id, nao o nome', async () => {
      const r = await montar().atualizarLead({
        lead: 'aslan',
        status: 'EM_CONTATO',
        observacao: 'liguei, pediu para voltar dia 10',
      });

      expect(statusLead.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: lead('Aslan').id,
          status: 'EM_CONTATO',
          observacao: 'liguei, pediu para voltar dia 10',
        }),
      );
      expect(r.status).toBe('ATUALIZADO');
      expect(r.mensagem).toContain('Anotei');
      expect(r.mensagem).toContain('em contato');
    });

    /** A BUSCA olha o historico: dar baixa por engano tem de poder ser desfeito. */
    it('procura tambem entre os ja resolvidos', async () => {
      await montar().atualizarLead({ lead: 'Aslan', status: 'NOVO' });

      expect(leads.listarPorVendedora).toHaveBeenCalledWith(
        'SEED-VD01',
        expect.any(Number),
        false,
      );
    });

    it('nome que nao e lead dela NAO escreve nada', async () => {
      const r = await montar().atualizarLead({
        lead: 'Fulana de Tal',
        status: 'NAO_VINGOU',
      });

      expect(statusLead.execute).not.toHaveBeenCalled();
      expect(r.status).toBe('NAO_ACHEI');
      expect(r.mensagem).toContain('NÃO ANOTEI');
    });

    /**
     * `NAO_E_DELA` vira a MESMA frase de nome errado. Dizer "esse e de outra
     * vendedora" ja entregaria que ele existe — a regra do canal inteiro.
     */
    it('lead de outra vendedora responde como nome errado', async () => {
      statusLead.execute.mockResolvedValue({ status: 'NAO_E_DELA' });

      const r = await montar().atualizarLead({
        lead: 'Aslan',
        status: 'NAO_VINGOU',
      });

      expect(r.status).toBe('NAO_ACHEI');
      expect(r.mensagem).not.toContain('outra');
    });

    it('sem codigo de vendedora, nao escreve e nao diz "nao tem"', async () => {
      const r = await montar(null).atualizarLead({
        lead: 'Aslan',
        status: 'NAO_VINGOU',
      });

      expect(r.status).toBe('SEM_CODIGO');
      expect(statusLead.execute).not.toHaveBeenCalled();
      expect(r.mensagem).toContain('NÃO ANOTEI');
    });

    describe('e a frase sobre o vinculo com o cadastro', () => {
      it('achou: diz que ligou', async () => {
        statusLead.execute.mockResolvedValue({
          status: 'ATUALIZADO',
          lead: lead('Aslan'),
          vinculo: 'ENCONTRADO',
        });

        const r = await montar().atualizarLead({
          lead: 'Aslan',
          status: 'VIROU_CLIENTE',
        });

        expect(r.mensagem).toContain('ficou ligado ao lead');
      });

      /**
       * O TESTE QUE IMPEDE A MENTIRA EDUCADA. Sem esta frase, a agente diria
       * "pronto, virou cliente" e a vendedora acreditaria num vinculo que nao
       * existe — ninguem descobriria, porque a coluna e invisivel para ela.
       */
      it('NAO achou: a frase diz isso, e proibe afirmar o contrario', async () => {
        statusLead.execute.mockResolvedValue({
          status: 'ATUALIZADO',
          lead: lead('Aslan'),
          vinculo: 'NAO_ENCONTRADO',
        });

        const r = await montar().atualizarLead({
          lead: 'Aslan',
          status: 'VIROU_CLIENTE',
        });

        expect(r.status).toBe('ATUALIZADO');
        expect(r.mensagem).toContain('NÃO existe cadastro');
        expect(r.mensagem).toContain('NÃO diga que já está ligado');
      });

      /** Baixa e contato nao falam de cadastro nenhum — seria ruido. */
      it('baixa comum nao menciona vinculo', async () => {
        const r = await montar().atualizarLead({
          lead: 'Aslan',
          status: 'NAO_VINGOU',
        });

        expect(r.mensagem).not.toContain('cadastro');
      });
    });
  });

  it('o total conta o que existe, e nao o que coube na mensagem', async () => {
    // O repositorio e chamado com teto+1 justamente para saber que ha mais.
    leads.listarPorVendedora.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => lead('Lead ' + i)),
    );

    const r = await montar().consultarMeusLeads();

    expect(r.linhas).toHaveLength(10);
    expect(r.total).toBe(11);
  });
});

describe('o panorama de leads da gestao (Anastasia)', () => {
  let resolverVendedora: { execute: jest.Mock };
  let leads: {
    listarPorVendedora: jest.Mock;
    listarAguardandoGestao: jest.Mock;
    panoramaDeLeads: jest.Mock;
  };
  let vendedoras: { listar: jest.Mock; buscarPorId: jest.Mock };
  let servico: FerramentasGestaoService;

  const MARINA = {
    status: 'ACHOU',
    id: 'vd-1',
    nome: 'Marina Albuquerque',
    codigoErp: 'SEED-VD01',
  };

  beforeEach(() => {
    resolverVendedora = { execute: jest.fn().mockResolvedValue(MARINA) };
    leads = {
      listarPorVendedora: jest.fn().mockResolvedValue([]),
      listarAguardandoGestao: jest.fn().mockResolvedValue([]),
      panoramaDeLeads: jest.fn().mockResolvedValue({
        porEstado: [],
        porVendedora: [],
        total: 0,
      }),
    };
    vendedoras = {
      listar: jest.fn().mockResolvedValue([
        { nome: 'Marina Albuquerque', codigoErp: 'SEED-VD01' },
      ]),
      buscarPorId: jest.fn(),
    };
    servico = new FerramentasGestaoService(
      resolverVendedora as never,
      // A consulta de venda, que desde 25/09 le a MOVIMENTACAO. Dublada aqui:
      // estes testes descrevem o roteamento das ferramentas, nao o SQL.
      { itens: jest.fn().mockResolvedValue({ linhas: [] }) } as never,
      { execute: jest.fn() } as never,
      { vendas: jest.fn(), metas: jest.fn() } as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { listar: jest.fn(), detalhe: jest.fn(), resumo: jest.fn() } as never,
      { doDia: jest.fn() } as never,
      { execute: jest.fn() } as never,
      vendedoras as never,
      { buscarPorNomeParcial: jest.fn() } as never,
      leads as never,
    );
  });

  const montar = () => servico.montar(null);

  it('sem nome: conta os estados, mostra a fila e soma por vendedora', async () => {
    leads.panoramaDeLeads.mockResolvedValue({
      porEstado: [
        { estado: 'READY_FOR_ROUTING', quantos: 1 },
        { estado: 'IN_HUMAN_SERVICE', quantos: 3 },
      ],
      porVendedora: [{ codigo: 'SEED-VD01', quantos: 3 }],
      total: 4,
    });
    leads.listarAguardandoGestao.mockResolvedValue([
      lead('Aslan', { estado: 'READY_FOR_ROUTING', vendedoraAprovadaCodigo: null }),
    ]);

    const r = await montar().gestaoPanoramaLeads({});

    expect(r.status).toBe('OK');
    expect(r.linhas[0]).toContain('4 leads no total');
    expect(r.linhas[0]).toContain('1 esperando encaminhamento');
    expect(r.linhas[0]).toContain('3 ja encaminhado');
    // A fila vem com nome E telefone: e sobre ela que o ADM decide agora.
    expect(r.linhas[1]).toContain('Esperando encaminhamento: Aslan');
    expect(r.linhas[1]).toContain('(85)');
    // O codigo vira NOME — ninguem decide olhando "SEED-VD01".
    expect(r.linhas[2]).toBe('Marina Albuquerque: 3 leads encaminhados');
  });

  it('com nome, traz os leads dela com telefone', async () => {
    leads.listarPorVendedora.mockResolvedValue([lead('Aslan')]);

    const r = await montar().gestaoPanoramaLeads({ vendedora: 'marina' });

    expect(leads.listarPorVendedora).toHaveBeenCalledWith(
      'SEED-VD01',
      expect.any(Number),
      // A gestao le o historico inteiro — ver o teste da baixa logo abaixo.
      false,
    );
    expect(r.status).toBe('OK');
    expect(r.vendedora).toBe('Marina Albuquerque');
    expect(r.linhas[0]).toContain('Aslan');
    expect(r.linhas[0]).toContain('(85)');
  });

  /**
   * ==========================================================================
   * A GESTAO VE O QUE A VENDEDORA JA RESOLVEU — 22/09/2026.
   *
   * A conversa que mostrou o buraco, minutos depois de a ferramenta subir:
   *
   *   Lucas:     "os leads dele"
   *   Anastasia: "O Lucas nao tem nenhum lead encaminhado no momento."
   *   Lucas:     "ele deu baixa em algum?"
   *   Anastasia: "Os leads nao guardam esse tipo de baixa..."
   *
   * Ele tinha dado baixa num lead quinze minutos antes. A primeira resposta
   * era verdade sobre a FILA e mentira sobre a pergunta — o recorte
   * `apenasAbertos`, que nasceu para a lista DELA, tinha vazado para a
   * leitura da gestao junto com o padrao do repositorio.
   *
   * A regra que estes testes travam: a lista da VENDEDORA e uma fila (o que
   * falta fazer); a da GESTAO e prestacao de contas (o que aconteceu). Os
   * recortes sao opostos de proposito.
   * ==========================================================================
   */
  it('a gestao ve TAMBEM o que ela ja resolveu', async () => {
    leads.listarPorVendedora.mockResolvedValue([
      lead('Aslan', {
        statusVendedora: 'NAO_VINGOU',
        observacaoVendedora: '22/09 · achou caro',
      }),
    ]);

    const r = await montar().gestaoPanoramaLeads({ vendedora: 'marina' });

    // O terceiro argumento e o que separa as duas leituras.
    const [, , apenasAbertos] = leads.listarPorVendedora.mock.calls[0];
    expect(apenasAbertos).toBe(false);
    expect(r.status).toBe('OK');
    expect(r.linhas[0]).toContain('nao vingou');
    expect(r.linhas[0]).toContain('achou caro');
  });

  /** Teto silencioso mente por omissao — vale aqui como na carteira. */
  it('acima do teto, a resposta diz que ha mais', async () => {
    leads.listarPorVendedora.mockResolvedValue(
      Array.from({ length: 16 }, (_, i) => lead(`Lead ${i}`)),
    );

    const r = await montar().gestaoPanoramaLeads({ vendedora: 'marina' });

    expect(r.linhas[r.linhas.length - 1]).toContain('mais de');
  });

  it('nome ambiguo nao consulta nada', async () => {
    resolverVendedora.execute.mockResolvedValue({
      status: 'AMBIGUA',
      nomes: ['Marina Albuquerque', 'Marina Prado'],
    });

    const r = await montar().gestaoPanoramaLeads({ vendedora: 'marina' });

    expect(leads.listarPorVendedora).not.toHaveBeenCalled();
    expect(r.status).toBe('AMBIGUA');
  });

  it('fila vazia devolve lista vazia, e nao uma contagem de zeros', async () => {
    const r = await montar().gestaoPanoramaLeads({});

    expect(r).toEqual({ status: 'OK', linhas: [] });
  });
});

/**
 * A LINHA DO LEAD — e a frase que disse "hoje" sobre ontem.
 *
 * ==========================================================================
 * 22/09/2026, 09:55. A Elena respondeu:
 *
 *   "Tem um lead sim, Lucas: Aslan — anel de noivado clássico, para noivado
 *    — chegou hoje — (85) 8646-7241"
 *
 * O lead tinha sido encaminhado as 16:13 do dia 21. O Lucas sabia que nao
 * tinha feito nenhum naquele dia, e foi assim que o defeito apareceu.
 *
 * NAO ERA A AGENTE INVENTANDO: a ferramenta entregou a frase pronta, com
 * "hoje" escrito nela. O erro estava na conta — periodos de 24h no lugar de
 * dias de calendario. Ver `diasDeCalendario`.
 * ==========================================================================
 */
describe('linhaDoLead', () => {
  const ONTEM_16H = new Date(2026, 8, 21, 16, 13);
  const HOJE_09H = new Date(2026, 8, 22, 9, 55);

  function aslan(parcial: Partial<Lead> = {}): Lead {
    return lead('Aslan', {
      produtosDesejados: 'anel de noivado classico',
      ocasiao: 'NOIVADO',
      criadoEm: ONTEM_16H,
      direcionadoVendedoraEm: ONTEM_16H,
      ...parcial,
    });
  }

  it('lead de ontem as 16h, lido as 09h de hoje, chegou ONTEM', () => {
    expect(chegadaLegivel(aslan(), HOJE_09H)).toBe('ontem');
    expect(linhaDoLead(aslan(), true)).toContain('Aslan');
  });

  it('lead do proprio dia continua sendo "hoje"', () => {
    const marco = new Date(2026, 8, 22, 0, 5);
    expect(chegadaLegivel(aslan({ direcionadoVendedoraEm: marco }), HOJE_09H)).toBe(
      'hoje',
    );
  });

  /**
   * O marco e o ENCAMINHAMENTO, e nao a chegada: para a vendedora a pergunta e
   * "ha quanto tempo isso esta comigo". Um lead que esperou tres dias na fila
   * da gestao e chegou a ela hoje e "hoje" — e nao "ha 3 dias".
   */
  it('vale o encaminhamento, e nao a criacao', () => {
    const l = aslan({
      criadoEm: new Date(2026, 8, 19, 10, 0),
      direcionadoVendedoraEm: new Date(2026, 8, 22, 8, 0),
    });
    expect(chegadaLegivel(l, HOJE_09H)).toBe('hoje');
  });

  it('sem encaminhamento, vale a chegada', () => {
    const l = aslan({ direcionadoVendedoraEm: null });
    expect(chegadaLegivel(l, HOJE_09H)).toBe('ontem');
  });

  it('dois dias ou mais viram a contagem', () => {
    const l = aslan({ direcionadoVendedoraEm: new Date(2026, 8, 19, 23, 50) });
    expect(chegadaLegivel(l, HOJE_09H)).toBe('ha 3 dias');
  });
});
