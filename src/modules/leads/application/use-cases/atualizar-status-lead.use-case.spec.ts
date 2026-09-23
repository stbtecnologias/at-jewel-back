import { AtualizarStatusLeadUseCase } from './atualizar-status-lead.use-case';
import type { Lead } from '../../domain/ports/repositories/lead-repository.port';

/**
 * A BAIXA NO LEAD — migracao 60, 22/09/2026.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE.
 *
 * 1. O ESCOPO E VERIFICADO NO CODIGO, e nao no prompt. Esta e a primeira
 *    ESCRITA que a vendedora faz sobre lead: sem a conferencia de dono, uma
 *    vendedora escreveria no lead de outra. E a diferenca de gravidade em
 *    relacao as ferramentas de leitura dela.
 *
 * 2. "ELA DISSE" E "O SISTEMA ACHOU" SAO FATOS SEPARADOS. Marcar VIROU_CLIENTE
 *    sem o cadastro existir e o caso COMUM (o ERP demora a sincronizar), e a
 *    resposta tem de carregar isso — e a licao do "ja anotei" do ATwpp.
 *
 * 3. O VINCULO NAO SE REESCREVE. `vinculado_em` guarda a PRIMEIRA vez, que e
 *    o que permite auditar a ligacao.
 * ==========================================================================
 */
function lead(parcial: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    nome: 'Aslan',
    apelido: null,
    whatsapp: '5585986467241',
    origemContato: 'whatsapp',
    ocasiao: 'NOIVADO',
    produtosDesejados: 'anel de noivado',
    resumoTriagem: null,
    vendedoraSugeridaCodigo: null,
    estado: 'IN_HUMAN_SERVICE',
    estadoAtualizadoEm: new Date(),
    clienteId: null,
    vinculadoEm: null,
    direcionadoGestaoEm: new Date(),
    vendedoraAprovadaCodigo: 'SEED-VD01',
    direcionadoVendedoraEm: new Date(),
    fechadoEm: new Date(),
    statusVendedora: 'NOVO',
    statusVendedoraEm: new Date(),
    observacaoVendedora: null,
    criadoEm: new Date(),
    ...parcial,
  };
}

describe('AtualizarStatusLeadUseCase', () => {
  let leads: {
    buscarPorId: jest.Mock;
    atualizarStatusVendedora: jest.Mock;
    vincularCliente: jest.Mock;
  };
  let buscarCliente: { execute: jest.Mock };
  let uc: AtualizarStatusLeadUseCase;

  beforeEach(() => {
    leads = {
      buscarPorId: jest.fn().mockResolvedValue(lead()),
      atualizarStatusVendedora: jest
        .fn()
        .mockImplementation((_id: string, status: string) =>
          Promise.resolve(lead({ statusVendedora: status as never })),
        ),
      vincularCliente: jest.fn().mockResolvedValue(lead()),
    };
    buscarCliente = { execute: jest.fn().mockResolvedValue(null) };
    uc = new AtualizarStatusLeadUseCase(leads as never, buscarCliente as never);
  });

  const pedir = (p: Record<string, unknown> = {}) =>
    uc.execute({
      leadId: 'lead-1',
      vendedoraCodigo: 'SEED-VD01',
      status: 'EM_CONTATO',
      ...p,
    } as never);

  describe('o escopo', () => {
    it('lead de OUTRA vendedora nao e tocado', async () => {
      leads.buscarPorId.mockResolvedValue(
        lead({ vendedoraAprovadaCodigo: 'SEED-VD99' }),
      );

      const r = await pedir();

      expect(r.status).toBe('NAO_E_DELA');
      expect(leads.atualizarStatusVendedora).not.toHaveBeenCalled();
    });

    /** Lead que nunca foi encaminhado tambem nao e de ninguem. */
    it('lead sem vendedora nao e tocado', async () => {
      leads.buscarPorId.mockResolvedValue(
        lead({ vendedoraAprovadaCodigo: null }),
      );

      expect((await pedir()).status).toBe('NAO_E_DELA');
      expect(leads.atualizarStatusVendedora).not.toHaveBeenCalled();
    });

    it('lead inexistente devolve NAO_ENCONTRADO', async () => {
      leads.buscarPorId.mockResolvedValue(null);

      expect((await pedir()).status).toBe('NAO_ENCONTRADO');
      expect(leads.atualizarStatusVendedora).not.toHaveBeenCalled();
    });
  });

  describe('a baixa', () => {
    it('grava o status dela e nao procura cliente nenhum', async () => {
      const r = await pedir({ status: 'NAO_VINGOU', observacao: 'nao atende' });

      expect(r.status).toBe('ATUALIZADO');
      expect(leads.atualizarStatusVendedora).toHaveBeenCalledWith(
        'lead-1',
        'NAO_VINGOU',
        // Com a data na frente — ver `juntarObservacao`.
        expect.stringContaining('nao atende'),
      );
      // Procurar cadastro numa baixa seria consulta a toa.
      expect(buscarCliente.execute).not.toHaveBeenCalled();
      expect(r.status === 'ATUALIZADO' && r.vinculo).toBe('NAO_SE_APLICA');
    });

    /**
     * O MOTIVO DA BAIXA NAO APAGA O QUE VEIO ANTES — 22/09/2026.
     *
     * Foi o fluxo real: "pediu para voltar dia 10" as 10:56, baixa as 10:57.
     * Substituir deixaria a conclusao sem a historia que a explica.
     */
    it('o motivo da baixa se soma ao que ja estava anotado', async () => {
      leads.buscarPorId.mockResolvedValue(
        lead({ observacaoVendedora: '21/09 · pediu para voltar dia 10' }),
      );

      await pedir({ status: 'NAO_VINGOU', observacao: 'achou caro' });

      const [, , observacao] = leads.atualizarStatusVendedora.mock.calls[0];
      expect(observacao).toContain('pediu para voltar dia 10');
      expect(observacao).toContain('achou caro');
    });

    /** Sem observacao a que ja existe FICA — ela trocou so o status. */
    it('sem observacao, nao manda nada para o repositorio apagar', async () => {
      await pedir({ status: 'EM_CONTATO' });

      expect(leads.atualizarStatusVendedora).toHaveBeenCalledWith(
        'lead-1',
        'EM_CONTATO',
        undefined,
      );
    });
  });

  describe('quando ela diz que virou cliente', () => {
    it('acha o cadastro pelo TELEFONE e grava o vinculo', async () => {
      buscarCliente.execute.mockResolvedValue({ id: 'cli-9', nome: 'Aslan F.' });

      const r = await pedir({ status: 'VIROU_CLIENTE' });

      // Pelo numero do lead — ela nao digita uuid nenhum.
      expect(buscarCliente.execute).toHaveBeenCalledWith('5585986467241');
      expect(leads.vincularCliente).toHaveBeenCalledWith('lead-1', 'cli-9');
      expect(r.status === 'ATUALIZADO' && r.vinculo).toBe('ENCONTRADO');
    });

    /**
     * O CASO QUE NAO PODE VIRAR MENTIRA. `clientes` e espelho do ERP e a
     * sincronizacao demora: ela marca hoje, o cadastro aparece amanha. O
     * status e gravado, o vinculo nao — e quem chama precisa SABER disso para
     * nao dizer "pronto, ligado".
     */
    it('sem cadastro no sistema, grava o status e AVISA que nao vinculou', async () => {
      buscarCliente.execute.mockResolvedValue(null);

      const r = await pedir({ status: 'VIROU_CLIENTE' });

      expect(r.status).toBe('ATUALIZADO');
      expect(r.status === 'ATUALIZADO' && r.vinculo).toBe('NAO_ENCONTRADO');
      expect(leads.vincularCliente).not.toHaveBeenCalled();
      // O status foi gravado assim mesmo: o que ela disse nao se perde.
      expect(leads.atualizarStatusVendedora).toHaveBeenCalledWith(
        'lead-1',
        'VIROU_CLIENTE',
        undefined,
      );
    });

    /** Cliente sem `id` e cliente nao persistido — nao ha o que vincular. */
    it('cliente sem id conta como nao encontrado', async () => {
      buscarCliente.execute.mockResolvedValue({ nome: 'Aslan F.' });

      const r = await pedir({ status: 'VIROU_CLIENTE' });

      expect(r.status === 'ATUALIZADO' && r.vinculo).toBe('NAO_ENCONTRADO');
      expect(leads.vincularCliente).not.toHaveBeenCalled();
    });

    /** `vinculado_em` guarda a PRIMEIRA vez. Revincular reescreveria a data. */
    it('lead ja vinculado nao procura nem revincula', async () => {
      leads.buscarPorId.mockResolvedValue(
        lead({ clienteId: 'cli-1', vinculadoEm: new Date(2026, 0, 1) }),
      );

      const r = await pedir({ status: 'VIROU_CLIENTE' });

      expect(buscarCliente.execute).not.toHaveBeenCalled();
      expect(leads.vincularCliente).not.toHaveBeenCalled();
      expect(r.status === 'ATUALIZADO' && r.vinculo).toBe('ENCONTRADO');
    });
  });
});
