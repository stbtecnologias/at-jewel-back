import { VarrerAlertasUseCase, emHoras } from './varrer-alertas.use-case';

/**
 * A VARREDURA DE ALERTAS — ANA-19, ANA-04 e ANA-21, 29/09/2026.
 *
 * ==========================================================================
 * ESTE E O UNICO CODIGO DO DOCUMENTO QUE FALA COM GENTE SOZINHO.
 *
 * Um numero errado numa consulta e um numero que ninguem usa. Um alerta
 * errado chega no WhatsApp de uma pessoa as 6h da manha — e depois de tres
 * desses, o quarto, que era o importante, ja nao e lido.
 *
 * Os dois defeitos que estes testes existem para impedir:
 *
 *   1. REPETIR. A varredura roda de hora em hora. Sem o anti-repeticao, o
 *      mesmo lead parado gera 24 avisos por dia, para sempre.
 *
 *   2. REGISTRAR ANTES DE ENVIAR. Se o WhatsApp falhar depois do registro, o
 *      aviso some PARA SEMPRE — a proxima rodada acha que ja avisou. Mandar
 *      duas vezes e ruim; nao mandar e pior.
 * ==========================================================================
 */
describe('a varredura de alertas', () => {
  const REGRA_SEM_RESPOSTA = {
    chave: 'lead_sem_resposta',
    descricao: 'x',
    ativo: true,
    prazoMinutos: 120,
    repetirAposMinutos: null,
  };
  const LEAD = {
    leadId: 'ld-1',
    nome: 'Marina',
    vendedoraCodigo: '017',
    vendedoraNome: 'Aline',
    desde: new Date(),
    minutosParado: 180,
  };

  let repo: Record<string, jest.Mock>;
  let enviar: jest.Mock;
  let useCase: VarrerAlertasUseCase;

  beforeEach(() => {
    repo = {
      listarRegras: jest.fn().mockResolvedValue([REGRA_SEM_RESPOSTA]),
      leadsSemResposta: jest.fn().mockResolvedValue([LEAD]),
      leadsParados: jest.fn().mockResolvedValue([]),
      jaAvisou: jest.fn().mockResolvedValue(false),
      registrarDisparo: jest.fn().mockResolvedValue(undefined),
      atualizarRegra: jest.fn(),
    };
    enviar = jest.fn().mockResolvedValue(undefined);
    useCase = new VarrerAlertasUseCase(repo as never);
  });

  it('avisa quem passou do prazo', async () => {
    const r = await useCase.execute(enviar, ['5585999990000']);

    expect(r.enviados).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][1]).toContain('Marina');
    expect(enviar.mock.calls[0][1]).toContain('ninguém respondeu');
  });

  describe('o que impede o repetidor', () => {
    it('não avisa de novo o que já foi avisado', async () => {
      repo.jaAvisou.mockResolvedValue(true);

      const r = await useCase.execute(enviar, ['5585999990000']);

      expect(r.repetidos).toBe(1);
      expect(r.enviados).toBe(0);
      expect(enviar).not.toHaveBeenCalled();
    });

    /* repetirApos nulo significa "uma vez só" — e a checagem tem de perguntar
     * "alguma vez já", e não "na última hora". */
    it('a janela nula chega ao repositório como nula', async () => {
      await useCase.execute(enviar, ['5585999990000']);

      expect(repo.jaAvisou).toHaveBeenCalledWith(
        'lead_sem_resposta',
        'LEAD',
        'ld-1',
        null,
      );
    });

    it('a janela configurada chega como está', async () => {
      repo.listarRegras.mockResolvedValue([
        { ...REGRA_SEM_RESPOSTA, repetirAposMinutos: 1440 },
      ]);

      await useCase.execute(enviar, ['5585999990000']);

      expect(repo.jaAvisou.mock.calls[0][3]).toBe(1440);
    });
  });

  /*
   * A ORDEM É O PONTO. Registrar antes de enviar troca "pode mandar duas
   * vezes" por "pode nunca mandar", e a segunda é a troca ruim.
   */
  describe('a ordem entre enviar e registrar', () => {
    it('o registro acontece DEPOIS do envio', async () => {
      const ordem: string[] = [];
      enviar.mockImplementation(async () => {
        ordem.push('enviou');
      });
      repo.registrarDisparo.mockImplementation(async () => {
        ordem.push('registrou');
      });

      await useCase.execute(enviar, ['5585999990000']);

      expect(ordem).toEqual(['enviou', 'registrou']);
    });

    it('envio que falha NÃO registra — o alerta continua devendo', async () => {
      enviar.mockRejectedValue(new Error('WAHA fora do ar'));

      const r = await useCase.execute(enviar, ['5585999990000']);

      expect(r.falhas).toBe(1);
      expect(r.enviados).toBe(0);
      expect(repo.registrarDisparo).not.toHaveBeenCalled();
    });

    it('uma falha não derruba a rodada', async () => {
      repo.leadsSemResposta.mockResolvedValue([LEAD, { ...LEAD, leadId: 'ld-2' }]);
      enviar.mockRejectedValueOnce(new Error('falhou')).mockResolvedValue(undefined);

      const r = await useCase.execute(enviar, ['5585999990000']);

      expect(r.falhas).toBe(1);
      expect(r.enviados).toBe(1);
    });
  });

  describe('vários destinatários', () => {
    it('manda para todos, e registra UMA vez', async () => {
      const r = await useCase.execute(enviar, ['111', '222', '333']);

      expect(enviar).toHaveBeenCalledTimes(3);
      expect(repo.registrarDisparo).toHaveBeenCalledTimes(1);
      expect(r.enviados).toBe(1);
    });

    /* Sem gestão com telefone não há alerta, e isso não é erro: é o estado de
     * quem ainda não cadastrou ninguém. */
    it('sem destinatário, não varre e não grita', async () => {
      const r = await useCase.execute(enviar, []);

      expect(enviar).not.toHaveBeenCalled();
      expect(repo.listarRegras).not.toHaveBeenCalled();
      expect(r.ignoradas[0]).toContain('nenhum usuário de gestão');
    });
  });

  describe('a configuração manda (ANA-20)', () => {
    it('regra desligada não dispara', async () => {
      repo.listarRegras.mockResolvedValue([
        { ...REGRA_SEM_RESPOSTA, ativo: false },
      ]);

      const r = await useCase.execute(enviar, ['5585999990000']);

      expect(enviar).not.toHaveBeenCalled();
      expect(r.ignoradas[0]).toContain('desligada');
    });

    it('o prazo vira o corte da consulta', async () => {
      const antes = Date.now();
      await useCase.execute(enviar, ['5585999990000']);

      const limite = repo.leadsSemResposta.mock.calls[0][0] as Date;
      // 120 minutos atrás, com folga para o relógio do teste.
      expect(antes - limite.getTime()).toBeGreaterThanOrEqual(120 * 60_000 - 1000);
      expect(antes - limite.getTime()).toBeLessThan(120 * 60_000 + 5000);
    });

    /*
     * REGRA SEM CODIGO DIZ QUE NAO TEM CODIGO.
     *
     * `meta_em_risco` e `queda_de_desempenho` dependem de um LIMIAR que e
     * decisao de negocio — quanto e "longe da meta". Devolver lista vazia em
     * silencio esconderia um alerta que nunca dispara.
     */
    it('regra sem implementação é dita, não fingida', async () => {
      repo.listarRegras.mockResolvedValue([
        { ...REGRA_SEM_RESPOSTA, chave: 'meta_em_risco' },
      ]);

      const r = await useCase.execute(enviar, ['5585999990000']);

      expect(r.ignoradas[0]).toContain('sem implementação');
      expect(r.avaliados).toBe(0);
      expect(enviar).not.toHaveBeenCalled();
    });
  });

  describe('o texto do alerta', () => {
    it('não leva o telefone da cliente', async () => {
      await useCase.execute(enviar, ['5585999990000']);
      expect(enviar.mock.calls[0][1]).not.toMatch(/\d{8,}/);
    });

    it('diz o que fazer, e não só o que aconteceu', async () => {
      await useCase.execute(enviar, ['5585999990000']);
      expect(enviar.mock.calls[0][1]).toMatch(/Vale /);
    });

    it('lead sem nome não vira "undefined"', async () => {
      repo.leadsSemResposta.mockResolvedValue([{ ...LEAD, nome: null }]);
      await useCase.execute(enviar, ['5585999990000']);

      expect(enviar.mock.calls[0][1]).not.toContain('undefined');
      expect(enviar.mock.calls[0][1]).toContain('sem nome');
    });
  });
});

describe('o tempo em palavras', () => {
  /* "10080 minutos" exige conta, e quem faz conta não age. */
  it.each([
    [30, '30 min'],
    [90, '2h'],
    [1440, '24h'],
    [10080, '7 dias'],
    [20160, '14 dias'],
  ])('%s minutos -> "%s"', (min, esperado) => {
    expect(emHoras(min)).toBe(esperado);
  });
});
