import { ProcessarRelatoVendedoraUseCase } from './processar-relato-vendedora.use-case';
import type {
  Atendimento,
  IAtendimentoRepository,
  Interacao,
} from '../../domain/ports/repositories/atendimento-repository.port';

/**
 * A RETOMADA: o que acontece quando a vendedora nao conseguiu falar com o
 * cliente e nao ha nada para remarcar.
 *
 * Antes de 20/08/2026 esse caminho era um beco sem saida — o relato era
 * gravado, uma frase gentil voltava, e NENHUMA pendencia ficava agendada. O
 * episodio seguia aberto para sempre, e como so pode haver um aberto por
 * cliente (indice parcial da migracao 35), um dia isso travaria um
 * encaminhamento novo do mesmo cliente.
 */

const ATENDIMENTO: Atendimento = {
  id: 'atend-1',
  clienteId: 'cli-1',
  vendedoraId: 'vd-1',
  ocasiao: 'CASAMENTO',
  abertoEm: new Date('2026-08-20T12:00:00Z'),
  fechadoEm: null,
  desfecho: null,
};

function interacao(over: Partial<Interacao>): Interacao {
  return {
    id: 'int-x',
    atendimentoId: 'atend-1',
    tipo: 'COBRANCA',
    combinadoEm: null,
    notificarEm: null,
    ocorridoEm: null,
    status: 'CONCLUIDA',
    relato: null,
    criadoEm: new Date('2026-08-20T12:00:00Z'),
    ...over,
  };
}

/** Cobranca normal: nasce de um horario combinado. Nao e retomada. */
const COBRANCA_NORMAL = interacao({
  id: 'int-cob',
  combinadoEm: new Date('2026-08-20T17:00:00Z'),
});

/** Retomada: cobranca SEM combinado — e a ausencia dele que a distingue. */
const RETOMADA = interacao({ id: 'int-ret', combinadoEm: null });

describe('ProcessarRelatoVendedoraUseCase — retomada', () => {
  let repo: jest.Mocked<IAtendimentoRepository>;
  let clientes: { buscarPorId: jest.Mock };
  let llm: { chat: jest.Mock };
  let atualizarPerfil: { execute: jest.Mock };
  let useCase: ProcessarRelatoVendedoraUseCase;

  /** O que o LLM devolve. So extrai campos — nao decide nada. */
  function extracao(over: Record<string, unknown> = {}) {
    return {
      texto: JSON.stringify({
        contatou: false,
        resultado: 'NAO_CONSEGUIU_FALAR',
        remarcado_para: null,
        ...over,
      }),
    };
  }

  beforeEach(() => {
    repo = {
      buscarCobrancaAguardando: jest.fn().mockResolvedValue({
        interacao: COBRANCA_NORMAL,
        atendimento: ATENDIMENTO,
      }),
      criarInteracao: jest.fn().mockResolvedValue(interacao({})),
      atualizarStatusInteracao: jest.fn(),
      listarInteracoes: jest.fn().mockResolvedValue([]),
      fechar: jest.fn(),
      reagendar: jest.fn(),
    } as unknown as jest.Mocked<IAtendimentoRepository>;

    clientes = { buscarPorId: jest.fn().mockResolvedValue({ nome: 'Carla Oliveira' }) };
    llm = { chat: jest.fn().mockResolvedValue(extracao()) };
    atualizarPerfil = { execute: jest.fn() };

    useCase = new ProcessarRelatoVendedoraUseCase(
      repo,
      clientes as never,
      llm as never,
      atualizarPerfil as never,
    );
  });

  /** As interacoes criadas na chamada, por tipo. */
  function criadas(tipo: string) {
    return repo.criarInteracao.mock.calls
      .map((c) => c[0])
      .filter((i) => i.tipo === tipo);
  }

  it('agenda a primeira retomada para daqui a 48h, sem horario combinado', async () => {
    const antes = Date.now();
    const r = await useCase.execute('vd-1', 'liguei umas três vezes, ninguém atendeu');

    expect(r.status).toBe('REGISTRADO');

    const cobrancas = criadas('COBRANCA');
    expect(cobrancas).toHaveLength(1);

    const horas = (cobrancas[0].notificarEm!.getTime() - antes) / 3_600_000;
    expect(horas).toBeGreaterThan(47.9);
    expect(horas).toBeLessThan(48.1);

    // Sem `combinadoEm` — e o que a distingue de uma cobranca comum, e o que
    // faz o texto do disparo virar "conseguiu falar depois?".
    expect(cobrancas[0].combinadoEm).toBeUndefined();
    expect(cobrancas[0].status).toBe('PENDENTE');
  });

  it('deixa na linha do tempo uma nota dizendo o que o sistema decidiu', async () => {
    await useCase.execute('vd-1', 'não atenderam');

    const notas = criadas('NOTA');
    expect(notas).toHaveLength(1);
    expect(notas[0].relato).toContain('Não conseguiu falar');
    expect(notas[0].relato).toContain('1ª de 2');
  });

  it('guarda a frase dela como RELATO, nao um resumo', async () => {
    await useCase.execute('vd-1', 'liguei umas três vezes, ninguém atendeu');

    const relatos = criadas('RELATO');
    expect(relatos).toHaveLength(1);
    expect(relatos[0].relato).toContain('ninguém atendeu');
  });

  it('agenda a segunda tentativa quando ja houve uma', async () => {
    repo.listarInteracoes.mockResolvedValue([COBRANCA_NORMAL, RETOMADA]);

    await useCase.execute('vd-1', 'continua sem atender');

    expect(criadas('COBRANCA')).toHaveLength(1);
    expect(criadas('NOTA')[0].relato).toContain('2ª de 2');
    expect(repo.fechar).not.toHaveBeenCalled();
  });

  it('encerra por INATIVIDADE no teto de duas tentativas', async () => {
    repo.listarInteracoes.mockResolvedValue([
      COBRANCA_NORMAL,
      RETOMADA,
      interacao({ id: 'int-ret-2', combinadoEm: null }),
    ]);

    const r = await useCase.execute('vd-1', 'nada ainda');

    expect(repo.fechar).toHaveBeenCalledWith('atend-1', 'INATIVIDADE');
    expect(criadas('COBRANCA')).toHaveLength(0);
    expect(r.status === 'REGISTRADO' && r.resposta).toContain('encerrei');
  });

  // A cobranca comum nao pode ser confundida com tentativa gasta: ela nasce de
  // um horario combinado e por isso tem `combinadoEm`.
  it('nao conta cobranca com horario combinado como tentativa', async () => {
    repo.listarInteracoes.mockResolvedValue([
      COBRANCA_NORMAL,
      interacao({ id: 'outra', combinadoEm: new Date('2026-08-21T10:00:00Z') }),
    ]);

    await useCase.execute('vd-1', 'não consegui');

    expect(repo.fechar).not.toHaveBeenCalled();
    expect(criadas('NOTA')[0].relato).toContain('1ª de 2');
  });

  describe('regressao — os caminhos que ja funcionavam', () => {
    it('remarcar continua reagendando, e nao vira retomada', async () => {
      llm.chat.mockResolvedValue(
        extracao({
          contatou: true,
          resultado: 'EM_ANDAMENTO',
          remarcado_para: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      );

      await useCase.execute('vd-1', 'pediu para retornar amanhã às 10h');

      expect(repo.reagendar).toHaveBeenCalled();
      expect(criadas('COBRANCA')).toHaveLength(0);
      expect(criadas('NOTA')).toHaveLength(0);
    });

    it('venda encerra o atendimento e nao agenda retomada', async () => {
      llm.chat.mockResolvedValue(extracao({ contatou: true, resultado: 'VENDA' }));

      await useCase.execute('vd-1', 'fechou! levou o colar');

      expect(repo.fechar).toHaveBeenCalledWith('atend-1', 'VENDA');
      expect(criadas('COBRANCA')).toHaveLength(0);
    });

    it('falou com o cliente para o relogio do SLA', async () => {
      llm.chat.mockResolvedValue(extracao({ contatou: true, resultado: 'EM_ANDAMENTO' }));

      await useCase.execute('vd-1', 'falei com ela, vai pensar');

      expect(atualizarPerfil.execute).toHaveBeenCalledWith('cli-1', {
        primeiroContatoEm: expect.any(Date),
      });
      expect(criadas('COBRANCA')).toHaveLength(0);
    });

    it('sem pendencia aguardando, nao faz nada', async () => {
      repo.buscarCobrancaAguardando.mockResolvedValue(null);

      const r = await useCase.execute('vd-1', 'oi');

      expect(r.status).toBe('SEM_PENDENCIA');
      expect(repo.criarInteracao).not.toHaveBeenCalled();
    });
  });
});
