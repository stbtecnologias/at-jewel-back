import { EncaminharPelaCarteiraUseCase } from './encaminhar-pela-carteira.use-case';
import type { Lead } from '../../domain/ports/repositories/lead-repository.port';

/**
 * A TRIAGEM VIRA ATENDIMENTO QUANDO A CLIENTE JA TEM CADASTRO — 23/09/2026.
 *
 * ==========================================================================
 * O CAMINHO ATE AQUI, porque ele explica o desenho:
 *
 * 1. O Lucas pos o proprio numero na cliente "Ana Livia", conversou ate a
 *    triagem fechar, e perguntou: "mas nao vejo na timeline da vendedora".
 *    Nao veria — o lead tinha parado na fila da gestao.
 *
 * 2. A primeira versao encaminhava o LEAD para a dona. Mas `encaminhar` FECHA
 *    o lead, e a mensagem seguinte da cliente abria outro e zerava a memoria:
 *    ela era cumprimentada do zero no meio da frase. Duas vezes.
 *
 * 3. As 15:37 ficou claro que nao era hora errada: a Anastasia se despediu E
 *    perguntou "ha algo que voce gostaria que eu adiantasse a ela?". O "que
 *    ela entre em contato as 17hrs" caiu num lead orfao. SEMPRE VAI EXISTIR UM
 *    TURNO DEPOIS DO ENCERRAMENTO.
 *
 * 4. O Lucas achou a raiz: "o lead geralmente usamos para novos clientes, sem
 *    cadastro. no caso desse cliente que tem cadastro, o final poderia virar o
 *    atendimento".
 * ==========================================================================
 */
describe('EncaminharPelaCarteiraUseCase', () => {
  const LEAD = {
    id: 'lead-1',
    clienteId: 'cli-1',
    nome: 'Ana Livia',
    whatsapp: '5585986467241',
    produtosDesejados: 'par de alianças clássicas',
    ocasiao: 'CASAMENTO',
    resumoTriagem: 'Cliente procura aliança clássica para casamento.',
  } as unknown as Lead;

  let leads: { encaminhar: jest.Mock };
  let clientes: { buscarPorId: jest.Mock };
  let vendedoras: { buscarPorCodigoErp: jest.Mock };
  let atendimentos: {
    buscarAbertoPorCliente: jest.Mock;
    abrir: jest.Mock;
    criarInteracao: jest.Mock;
    completarOcasiaoSeVazia: jest.Mock;
  };
  let whatsapp: { resolverChatId: jest.Mock; enviarTexto: jest.Mock };
  let useCase: EncaminharPelaCarteiraUseCase;

  const HELENA = {
    id: 'vend-1',
    nome: 'Helena',
    codigoErp: '007',
    ativo: true,
    whatsappInterno: '5585999990000',
  };

  beforeEach(() => {
    leads = { encaminhar: jest.fn().mockResolvedValue(LEAD) };
    clientes = {
      buscarPorId: jest.fn().mockResolvedValue({ vendedoraCodigoErp: '007' }),
    };
    vendedoras = { buscarPorCodigoErp: jest.fn().mockResolvedValue(HELENA) };
    atendimentos = {
      buscarAbertoPorCliente: jest.fn().mockResolvedValue(null),
      abrir: jest.fn().mockResolvedValue({ id: 'atend-1' }),
      criarInteracao: jest.fn().mockResolvedValue({ id: 'int-1' }),
      completarOcasiaoSeVazia: jest.fn().mockResolvedValue(undefined),
    };
    whatsapp = {
      resolverChatId: jest.fn().mockResolvedValue('chat-1'),
      enviarTexto: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new EncaminharPelaCarteiraUseCase(
      leads as never,
      clientes as never,
      vendedoras as never,
      atendimentos as never,
      whatsapp as never,
    );
    jest.spyOn(useCase['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(useCase['logger'], 'error').mockImplementation(() => undefined);
  });

  describe('a triagem vira atendimento', () => {
    it('abre o atendimento para a dona da carteira', async () => {
      const r = await useCase.execute(LEAD);

      expect(r).toEqual({
        status: 'ATENDEU',
        vendedoraNome: 'Helena',
        atendimentoId: 'atend-1',
        reusou: false,
        avisada: true,
      });
      expect(atendimentos.abrir).toHaveBeenCalledWith({
        clienteId: 'cli-1',
        vendedoraId: 'vend-1',
        ocasiao: 'CASAMENTO',
      });
    });

    /**
     * SEM ISTO O ATENDIMENTO NASCERIA MUDO: a vendedora abriria a tela e nao
     * veria por que aquela cliente esta ali.
     *
     * O TIPO E `ABERTURA` (migracao 64), e nao `ENCAMINHADO`: os dois caem no
     * mesmo minuto e, dividindo o mesmo tipo, a linha do tempo desenhava duas
     * bolinhas com a MESMA frase. Visto pelo Lucas: "acho que o atendimento
     * ficou 2 vezes".
     */
    it('grava a triagem como a primeira interacao', async () => {
      await useCase.execute(LEAD);

      expect(atendimentos.criarInteracao).toHaveBeenCalledWith(
        expect.objectContaining({
          atendimentoId: 'atend-1',
          tipo: 'ABERTURA',
          relato: 'Cliente procura aliança clássica para casamento.',
        }),
      );
    });

    /** Sem resumo, ainda assim o atendimento diz de onde veio. */
    it('sem resumo, monta um relato com o que tem', async () => {
      await useCase.execute({ ...LEAD, resumoTriagem: null } as Lead);

      const relato = atendimentos.criarInteracao.mock.calls[0][0].relato as string;
      expect(relato).toContain('par de alianças clássicas');
      expect(relato).toMatch(/triagem/i);
    });

    /**
     * O LEAD FECHA PORQUE O ASSUNTO MUDOU DE CASA. Deixa-lo aberto faria a
     * proxima mensagem continuar uma triagem que ja terminou.
     */
    it('fecha o lead, apontando para a dona', async () => {
      await useCase.execute(LEAD);

      expect(leads.encaminhar).toHaveBeenCalledWith('lead-1', '007');
    });

    /**
     * A RAZAO DE NEGOCIO, do Lucas: "se ficar apenas como um aviso, ela pode
     * ligar e nem passar pelo atendimento".
     */
    it('a mensagem diz que abriu e oferece agendar', async () => {
      await useCase.execute(LEAD);

      const texto = whatsapp.enviarTexto.mock.calls[0][1] as string;
      expect(texto).toContain('Ana Livia');
      expect(texto).toContain('par de alianças clássicas');
      expect(texto).toMatch(/atendimento/i);
      expect(texto).toMatch(/agenda/i);
    });
  });

  /**
   * `uq_atendimento_aberto_por_cliente` so permite UM aberto por cliente —
   * abrir um segundo levantaria violacao de unicidade. Decisao do Lucas entre
   * reusar e recusar: reusar.
   */
  describe('quando ja ha atendimento aberto', () => {
    beforeEach(() => {
      atendimentos.buscarAbertoPorCliente.mockResolvedValue({ id: 'atend-velho' });
    });

    it('entra no aberto em vez de abrir outro', async () => {
      const r = await useCase.execute(LEAD);

      expect(r).toMatchObject({ atendimentoId: 'atend-velho', reusou: true });
      expect(atendimentos.abrir).not.toHaveBeenCalled();
      expect(atendimentos.criarInteracao).toHaveBeenCalledWith(
        expect.objectContaining({ atendimentoId: 'atend-velho' }),
      );
    });

    /**
     * O atendimento pode ter nascido de uma venda de aniversario, e a triagem
     * de agora falar de casamento. Sobrescrever apagaria o motivo original —
     * por isso `completarOcasiaoSeVazia`, e nao um update cru.
     */
    it('so completa a ocasiao se estiver vazia', async () => {
      await useCase.execute(LEAD);

      expect(atendimentos.completarOcasiaoSeVazia).toHaveBeenCalledWith(
        'atend-velho',
        'CASAMENTO',
      );
    });

    it('lead sem ocasiao nao tenta completar nada', async () => {
      await useCase.execute({ ...LEAD, ocasiao: null } as Lead);

      expect(atendimentos.completarOcasiaoSeVazia).not.toHaveBeenCalled();
    });
  });

  describe('quando a carteira nao decide', () => {
    it('lead sem cliente atras nao tem dona', async () => {
      const r = await useCase.execute({ ...LEAD, clienteId: null } as Lead);

      expect(r).toEqual({ status: 'SEM_DONA' });
      expect(clientes.buscarPorId).not.toHaveBeenCalled();
      expect(atendimentos.abrir).not.toHaveBeenCalled();
    });

    it('cliente sem vendedora no cadastro nao tem dona', async () => {
      clientes.buscarPorId.mockResolvedValue({ vendedoraCodigoErp: null });

      expect(await useCase.execute(LEAD)).toEqual({ status: 'SEM_DONA' });
      expect(atendimentos.abrir).not.toHaveBeenCalled();
    });

    /** Codigo que aponta para vendedora apagada — o cadastro mente. */
    it('vendedora inexistente nao tem dona', async () => {
      vendedoras.buscarPorCodigoErp.mockResolvedValue(null);

      expect(await useCase.execute(LEAD)).toEqual({ status: 'SEM_DONA' });
    });

    /**
     * Inativa NAO recebe, e o lead FICA na fila: a gestao decide, sabendo o
     * motivo. Abrir atendimento para quem saiu da casa seria pior que esperar.
     */
    it('dona inativa devolve o motivo e nao abre nada', async () => {
      vendedoras.buscarPorCodigoErp.mockResolvedValue({ ...HELENA, ativo: false });

      expect(await useCase.execute(LEAD)).toEqual({
        status: 'DONA_INDISPONIVEL',
        vendedoraNome: 'Helena',
        motivo: 'está inativa',
      });
      expect(atendimentos.abrir).not.toHaveBeenCalled();
      expect(leads.encaminhar).not.toHaveBeenCalled();
      expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    });
  });

  /**
   * HOJE 19 DAS 23 VENDEDORAS NAO TEM WHATSAPP PESSOAL CADASTRADO. Se a falta
   * do aviso barrasse, a regra da carteira nao valeria para quase ninguem — e
   * O ATENDIMENTO E O REGISTRO QUE IMPORTA, nao a mensagem.
   */
  describe('a falha de aviso nao cancela o atendimento', () => {
    it('sem whatsapp pessoal, atende do mesmo jeito', async () => {
      vendedoras.buscarPorCodigoErp.mockResolvedValue({
        ...HELENA,
        whatsappInterno: null,
      });

      const r = await useCase.execute(LEAD);

      expect(r).toMatchObject({ status: 'ATENDEU', avisada: false });
      expect(atendimentos.abrir).toHaveBeenCalled();
      expect(leads.encaminhar).toHaveBeenCalled();
    });

    /** Numero cadastrado que nao tem conta de WhatsApp. */
    it('numero sem conta de WhatsApp tambem nao barra', async () => {
      whatsapp.resolverChatId.mockResolvedValue(null);

      expect(await useCase.execute(LEAD)).toMatchObject({
        status: 'ATENDEU',
        avisada: false,
      });
    });

    it('WAHA fora do ar tambem nao barra', async () => {
      whatsapp.enviarTexto.mockRejectedValue(new Error('WAHA fora do ar'));

      const r = await useCase.execute(LEAD);

      expect(r).toMatchObject({ status: 'ATENDEU', avisada: false });
      expect(atendimentos.criarInteracao).toHaveBeenCalled();
    });
  });
});
