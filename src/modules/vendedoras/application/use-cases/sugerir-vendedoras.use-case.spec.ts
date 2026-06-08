import { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { IVendaRepository } from '../../../vendas/domain/ports/repositories/venda-repository.port';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import { VendedoraMetricas } from '../../domain/entities/vendedora-metricas.entity';
import { IVendedoraMetricasRepository } from '../../domain/ports/repositories/vendedora-metricas-repository.port';
import { ListarVendedorasDisponiveisUseCase } from './listar-vendedoras-disponiveis.use-case';
import {
  PESOS_SUGESTAO,
  SugerirVendedorasUseCase,
} from './sugerir-vendedoras.use-case';

function vendedora(overrides: {
  id?: string;
  codigoErp?: string | null;
  nome: string;
  especialidades?: string[];
}): Vendedora {
  return Vendedora.create({
    id: overrides.id,
    codigoErp: overrides.codigoErp ?? null,
    nome: overrides.nome,
    tipo: 'LOCAL',
    ativo: true,
    statusDisponibilidade: 'DISPONIVEL',
    especialidades: overrides.especialidades ?? [],
  });
}

function metricas(overrides: {
  vendedoraId: string;
  taxaRecompra?: number;
  ticketMedio?: number;
}): VendedoraMetricas {
  return VendedoraMetricas.create({
    vendedoraId: overrides.vendedoraId,
    totalVendas: 10,
    receitaTotal: 50000,
    ticketMedio: overrides.ticketMedio ?? 0,
    clientesDistintos: 8,
    clientesRecorrentes: 3,
    taxaRecompra: overrides.taxaRecompra ?? 0,
    tempoMedioFechamentoHoras: null,
    primeiraVendaEm: null,
    ultimaVendaEm: null,
    atualizadoEm: new Date(),
  });
}

describe('SugerirVendedorasUseCase', () => {
  let useCase: SugerirVendedorasUseCase;
  let listarDisponiveis: jest.Mocked<ListarVendedorasDisponiveisUseCase>;
  let metricasRepo: jest.Mocked<IVendedoraMetricasRepository>;
  let vendaRepo: jest.Mocked<IVendaRepository>;
  let clienteRepo: jest.Mocked<IClienteRepository>;

  beforeEach(() => {
    listarDisponiveis = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListarVendedorasDisponiveisUseCase>;

    metricasRepo = {
      listar: jest.fn().mockResolvedValue([]),
      buscarPorVendedoraId: jest.fn(),
      refresh: jest.fn(),
    } as unknown as jest.Mocked<IVendedoraMetricasRepository>;

    vendaRepo = {
      criarComAgregado: jest.fn(),
      upsertByCodigoErp: jest.fn(),
      buscarPorId: jest.fn(),
      buscarPorCodigoErp: jest.fn(),
      listar: jest.fn(),
      listarVendedoraIdsPorCliente: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<IVendaRepository>;

    clienteRepo = {
      criarComPerfil: jest.fn(),
      buscarPorId: jest.fn().mockResolvedValue(null),
      buscarPorCodigoErp: jest.fn(),
      buscarPorTelefone1Hash: jest.fn(),
      buscarPorEmailHash: jest.fn(),
      listar: jest.fn(),
      atualizar: jest.fn(),
    } as unknown as jest.Mocked<IClienteRepository>;

    useCase = new SugerirVendedorasUseCase(
      listarDisponiveis,
      metricasRepo,
      vendaRepo,
      clienteRepo,
    );
  });

  it('retorna lista vazia quando nao ha vendedora disponivel', async () => {
    listarDisponiveis.execute.mockResolvedValue([]);

    const resultado = await useCase.execute({});

    expect(resultado).toEqual([]);
    // Sem candidatas, nao consulta relacionamento nem metricas.
    expect(vendaRepo.listarVendedoraIdsPorCliente).not.toHaveBeenCalled();
    expect(metricasRepo.listar).not.toHaveBeenCalled();
  });

  it('ranqueia a vendedora com relacionamento previo (venda concluida) primeiro', async () => {
    const comRelacao = vendedora({ id: 'v-1', codigoErp: 'E1', nome: 'Ana' });
    const semRelacao = vendedora({ id: 'v-2', codigoErp: 'E2', nome: 'Bia' });
    listarDisponiveis.execute.mockResolvedValue([semRelacao, comRelacao]);
    vendaRepo.listarVendedoraIdsPorCliente.mockResolvedValue(['v-1']);

    const resultado = await useCase.execute({ clienteId: 'c-1' });

    expect(resultado[0].nome).toBe('Ana');
    expect(resultado[0].motivos).toContain('ja atendeu este cliente');
    expect(resultado[0].score).toBeGreaterThan(resultado[1].score);
  });

  it('detecta relacionamento por vendedora atribuida no cadastro do cliente', async () => {
    const atribuida = vendedora({ id: 'v-1', codigoErp: 'E1', nome: 'Ana' });
    const outra = vendedora({ id: 'v-2', codigoErp: 'E2', nome: 'Bia' });
    listarDisponiveis.execute.mockResolvedValue([outra, atribuida]);
    vendaRepo.listarVendedoraIdsPorCliente.mockResolvedValue([]);
    clienteRepo.buscarPorId.mockResolvedValue({
      vendedoraCodigoErp: 'E1',
    } as never);

    const resultado = await useCase.execute({ clienteId: 'c-1' });

    expect(resultado[0].nome).toBe('Ana');
    expect(resultado[0].motivos).toContain('ja atendeu este cliente');
  });

  it('sobe o score quando a especialidade casa (match parcial case-insensitive)', async () => {
    const especialista = vendedora({
      id: 'v-1',
      codigoErp: 'E1',
      nome: 'Ana',
      especialidades: ['Aneis de noivado'],
    });
    listarDisponiveis.execute.mockResolvedValue([especialista]);

    const semEsp = await useCase.execute({ especialidade: undefined });
    // Match parcial case-insensitive: 'NOIVADO' e substring de 'Aneis de noivado'.
    const comEsp = await useCase.execute({ especialidade: 'NOIVADO' });

    expect(comEsp[0].score).toBeGreaterThan(semEsp[0].score);
    expect(comEsp[0].motivos.some((m) => m.includes('especialista'))).toBe(true);
  });

  it('nao zera vendedora sem metricas: recebe score neutro de desempenho', async () => {
    const nova = vendedora({ id: 'v-nova', codigoErp: 'E9', nome: 'Nova' });
    listarDisponiveis.execute.mockResolvedValue([nova]);
    metricasRepo.listar.mockResolvedValue([]); // sem linha na matview

    const resultado = await useCase.execute({});

    // BASE + metade do peso de desempenho (neutro), sem outros boosts.
    const esperado = PESOS_SUGESTAO.BASE + PESOS_SUGESTAO.DESEMPENHO_MAX / 2;
    expect(resultado[0].score).toBe(esperado);
    expect(resultado[0].score).toBeGreaterThan(0);
  });

  it('da mais score a vendedora com ticket medio compativel', async () => {
    const compativel = vendedora({ id: 'v-1', codigoErp: 'E1', nome: 'Ana' });
    const distante = vendedora({ id: 'v-2', codigoErp: 'E2', nome: 'Bia' });
    listarDisponiveis.execute.mockResolvedValue([compativel, distante]);
    metricasRepo.listar.mockResolvedValue([
      metricas({ vendedoraId: 'v-1', ticketMedio: 5000, taxaRecompra: 0 }),
      metricas({ vendedoraId: 'v-2', ticketMedio: 50000, taxaRecompra: 0 }),
    ]);

    const resultado = await useCase.execute({ ticketEstimado: 5000 });

    expect(resultado[0].nome).toBe('Ana');
    expect(resultado[0].motivos).toContain('ticket medio compativel');
    expect(resultado[0].score).toBeGreaterThan(resultado[1].score);
  });

  it('respeita o limit (default 3 e valor explicito)', async () => {
    const candidatas = Array.from({ length: 6 }, (_, i) =>
      vendedora({ id: `v-${i}`, codigoErp: `E${i}`, nome: `Nome${i}` }),
    );
    listarDisponiveis.execute.mockResolvedValue(candidatas);

    const padrao = await useCase.execute({});
    expect(padrao).toHaveLength(3);

    const explicito = await useCase.execute({ limit: 2 });
    expect(explicito).toHaveLength(2);
  });

  it('nao expoe metricas cruas nem PII de cliente no retorno', async () => {
    const v = vendedora({ id: 'v-1', codigoErp: 'E1', nome: 'Ana' });
    listarDisponiveis.execute.mockResolvedValue([v]);
    metricasRepo.listar.mockResolvedValue([
      metricas({ vendedoraId: 'v-1', ticketMedio: 5000, taxaRecompra: 0.9 }),
    ]);

    const [item] = await useCase.execute({ clienteId: 'c-1', ticketEstimado: 5000 });

    expect(Object.keys(item).sort()).toEqual(
      ['codigoErp', 'motivos', 'nome', 'score', 'tipo'].sort(),
    );
    // Nenhum motivo carrega numero cru de metrica nem id de cliente.
    for (const motivo of item.motivos) {
      expect(motivo).not.toContain('c-1');
      expect(motivo).not.toMatch(/\d/);
    }
  });
});
