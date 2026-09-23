import { EncaminharPelaCarteiraUseCase } from './encaminhar-pela-carteira.use-case';
import type { Lead } from '../../domain/ports/repositories/lead-repository.port';

/**
 * A CLIENTE VOLTOU, E ELA JA TEM DONA — 23/09/2026.
 *
 * ==========================================================================
 * O CASO REAL: o Lucas cadastrou o proprio numero na cliente "Ana Livia",
 * conversou pelo WhatsApp ate a triagem fechar, e o lead parou na fila da
 * gestao — mesmo com a Ana Livia tendo vendedora na carteira. Ele perguntou:
 *
 *   "mas nao vejo na timeline da vendedora"
 *
 * E nao veria: o ramo de lead da timeline exige
 * `vendedora_aprovada_codigo` + `direcionado_vendedora_em`, e os dois estavam
 * vazios. Sem vendedora nao ha faixa onde desenhar o ponto.
 *
 * A REGRA que ele deu: "se o cliente tem uma vendedora associada, e tudo com
 * ela". Trocar existe, mas e caso muito especifico.
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
  } as unknown as Lead;

  let leads: { encaminhar: jest.Mock };
  let clientes: { buscarPorId: jest.Mock };
  let vendedoras: { buscarPorCodigoErp: jest.Mock };
  let whatsapp: { resolverChatId: jest.Mock; enviarTexto: jest.Mock };
  let useCase: EncaminharPelaCarteiraUseCase;

  const HELENA = {
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
    whatsapp = {
      resolverChatId: jest.fn().mockResolvedValue('chat-1'),
      enviarTexto: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new EncaminharPelaCarteiraUseCase(
      leads as never,
      clientes as never,
      vendedoras as never,
      whatsapp as never,
    );
    jest.spyOn(useCase['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(useCase['logger'], 'error').mockImplementation(() => undefined);
  });

  describe('a carteira decide', () => {
    it('encaminha para a dona e avisa ela', async () => {
      const r = await useCase.execute(LEAD);

      expect(r).toEqual({
        status: 'ENCAMINHADO',
        vendedoraNome: 'Helena',
        avisada: true,
      });
      expect(leads.encaminhar).toHaveBeenCalledWith('lead-1', '007');
      expect(whatsapp.enviarTexto).toHaveBeenCalledTimes(1);
    });

    /**
     * A RAZAO DE NEGOCIO, do Lucas: "se ficar apenas como um aviso, ela pode
     * ligar e nem passar pelo atendimento". Respondendo o horario, a Elena
     * chama `agendarContato`, que ABRE o atendimento — e a trajetoria comeca
     * registrada, virando ponto na timeline.
     *
     * A oferta e segura AQUI e so aqui: `atendimentos.cliente_id` e NOT NULL,
     * e neste caminho o lead SEMPRE tem cliente. Foi o defeito de 22/09, em
     * que a Elena ofereceu agendar um lead sem cadastro.
     */
    it('a mensagem oferece agendar o contato', async () => {
      await useCase.execute(LEAD);

      const texto = whatsapp.enviarTexto.mock.calls[0][1] as string;
      expect(texto).toContain('Ana Livia');
      expect(texto).toContain('par de alianças clássicas');
      expect(texto).toMatch(/agenda/i);
      expect(texto).toMatch(/horário/i);
    });
  });

  describe('quando a carteira nao decide', () => {
    it('lead sem cliente atras nao tem dona', async () => {
      const r = await useCase.execute({ ...LEAD, clienteId: null } as Lead);

      expect(r).toEqual({ status: 'SEM_DONA' });
      expect(clientes.buscarPorId).not.toHaveBeenCalled();
      expect(leads.encaminhar).not.toHaveBeenCalled();
    });

    it('cliente sem vendedora no cadastro nao tem dona', async () => {
      clientes.buscarPorId.mockResolvedValue({ vendedoraCodigoErp: null });

      expect(await useCase.execute(LEAD)).toEqual({ status: 'SEM_DONA' });
      expect(leads.encaminhar).not.toHaveBeenCalled();
    });

    /** Codigo que aponta para vendedora apagada — o cadastro mente. */
    it('vendedora inexistente nao tem dona', async () => {
      vendedoras.buscarPorCodigoErp.mockResolvedValue(null);

      expect(await useCase.execute(LEAD)).toEqual({ status: 'SEM_DONA' });
    });

    /**
     * Inativa NAO recebe, e o lead FICA na fila: a gestao decide, sabendo o
     * motivo. Encaminhar para quem saiu da casa seria perder o lead em
     * silencio.
     */
    it('dona inativa devolve o motivo e nao encaminha', async () => {
      vendedoras.buscarPorCodigoErp.mockResolvedValue({
        ...HELENA,
        ativo: false,
      });

      expect(await useCase.execute(LEAD)).toEqual({
        status: 'DONA_INDISPONIVEL',
        vendedoraNome: 'Helena',
        motivo: 'está inativa',
      });
      expect(leads.encaminhar).not.toHaveBeenCalled();
      expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    });
  });

  /**
   * HOJE 19 DAS 23 VENDEDORAS NAO TEM WHATSAPP PESSOAL CADASTRADO. Se a falta
   * do aviso barrasse o encaminhamento, a regra nao valeria para quase
   * ninguem — e o lead ficaria na fila de ninguem em vez da lista da dona.
   */
  describe('a falha de aviso nao cancela o encaminhamento', () => {
    it('sem whatsapp pessoal, encaminha do mesmo jeito', async () => {
      vendedoras.buscarPorCodigoErp.mockResolvedValue({
        ...HELENA,
        whatsappInterno: null,
      });

      const r = await useCase.execute(LEAD);

      expect(r).toEqual({
        status: 'ENCAMINHADO',
        vendedoraNome: 'Helena',
        avisada: false,
      });
      expect(leads.encaminhar).toHaveBeenCalledWith('lead-1', '007');
    });

    /** Numero cadastrado que nao tem conta de WhatsApp. */
    it('numero sem conta de WhatsApp tambem nao barra', async () => {
      whatsapp.resolverChatId.mockResolvedValue(null);

      const r = await useCase.execute(LEAD);

      expect(r).toMatchObject({ status: 'ENCAMINHADO', avisada: false });
      expect(leads.encaminhar).toHaveBeenCalled();
    });

    it('WAHA fora do ar tambem nao barra', async () => {
      whatsapp.enviarTexto.mockRejectedValue(new Error('WAHA fora do ar'));

      const r = await useCase.execute(LEAD);

      expect(r).toMatchObject({ status: 'ENCAMINHADO', avisada: false });
      expect(leads.encaminhar).toHaveBeenCalled();
    });
  });
});
