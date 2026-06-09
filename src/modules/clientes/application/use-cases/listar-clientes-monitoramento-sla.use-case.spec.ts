import { ClientePerfil } from '../../domain/entities/cliente-perfil.entity';
import {
  ESTADOS_MONITORADOS_SLA,
  EstadoConversaAgente,
} from '../../domain/entities/enums';
import { IClientePerfilRepository } from '../../domain/ports/repositories/cliente-perfil-repository.port';
import { ListarClientesMonitoramentoSlaUseCase } from './listar-clientes-monitoramento-sla.use-case';

function makePerfilRepoMock(): jest.Mocked<IClientePerfilRepository> {
  return {
    buscarPorClienteId: jest.fn(),
    buscarPorWhatsappHash: jest.fn(),
    atualizar: jest.fn(),
    deletar: jest.fn(),
    listarPorEstados: jest.fn(),
  } as unknown as jest.Mocked<IClientePerfilRepository>;
}

function makePerfil(
  clienteId: string,
  estado: EstadoConversaAgente,
  estadoAtualizadoEm: Date,
  primeiroContatoEm: Date | null = null,
): ClientePerfil {
  return ClientePerfil.create({
    clienteId,
    // PII presente no dominio mas que NUNCA deve sair na view de SLA.
    whatsapp: '85988887777',
    whatsappHash: 'hash-secreto',
    origemContato: 'whatsapp',
    estadoConversa: estado,
    estadoAtualizadoEm,
    urgencia: 'imediata',
    vendedoraSugeridaCodigo: 'V001',
    vendedoraAprovadaCodigo: null,
    intencaoCompra: 'anel de noivado',
    notasInternas: 'nota sensivel',
    primeiroContatoEm,
  });
}

describe('ListarClientesMonitoramentoSlaUseCase', () => {
  let useCase: ListarClientesMonitoramentoSlaUseCase;
  let repo: jest.Mocked<IClientePerfilRepository>;

  beforeEach(() => {
    repo = makePerfilRepoMock();
    useCase = new ListarClientesMonitoramentoSlaUseCase(repo);
  });

  it('consulta SO os tres estados monitorados (exclui TRIAGE_IN_PROGRESS e terminais)', async () => {
    repo.listarPorEstados.mockResolvedValue([]);

    await useCase.execute({ limit: 200 });

    expect(repo.listarPorEstados).toHaveBeenCalledTimes(1);
    const [estadosArg] = repo.listarPorEstados.mock.calls[0];
    expect(estadosArg).toEqual([
      'READY_FOR_ROUTING',
      'WAITING_OWNER_APPROVAL',
      'IN_HUMAN_SERVICE',
    ]);
    expect(estadosArg).not.toContain('TRIAGE_IN_PROGRESS');
    expect(estadosArg).not.toContain('NEEDS_HUMAN');
    // Sanidade: a lista usada e exatamente a constante de dominio.
    expect(estadosArg).toEqual([...ESTADOS_MONITORADOS_SLA]);
  });

  it('repassa o limit ao repositorio', async () => {
    repo.listarPorEstados.mockResolvedValue([]);

    await useCase.execute({ limit: 50 });

    expect(repo.listarPorEstados).toHaveBeenCalledWith(expect.any(Array), 50);
  });

  it('quando estado e informado, consulta apenas aquele estado', async () => {
    repo.listarPorEstados.mockResolvedValue([]);

    await useCase.execute({ estado: 'WAITING_OWNER_APPROVAL', limit: 200 });

    expect(repo.listarPorEstados).toHaveBeenCalledWith(
      ['WAITING_OWNER_APPROVAL'],
      200,
    );
  });

  it('preserva a ordenacao retornada pelo repositorio (mais antigo primeiro)', async () => {
    const antigo = makePerfil(
      'c-antigo',
      'READY_FOR_ROUTING',
      new Date('2026-01-01T08:00:00Z'),
    );
    const recente = makePerfil(
      'c-recente',
      'IN_HUMAN_SERVICE',
      new Date('2026-01-01T10:00:00Z'),
    );
    repo.listarPorEstados.mockResolvedValue([antigo, recente]);

    const resultado = await useCase.execute({ limit: 200 });

    expect(resultado.map((r) => r.clienteId)).toEqual(['c-antigo', 'c-recente']);
    expect(resultado[0].estadoAtualizadoEm).toBe('2026-01-01T08:00:00.000Z');
  });

  it('retorna SO os campos de SLA — nenhuma PII (chaves proibidas ausentes)', async () => {
    const perfil = makePerfil(
      'c-1',
      'READY_FOR_ROUTING',
      new Date('2026-01-01T08:00:00Z'),
    );
    repo.listarPorEstados.mockResolvedValue([perfil]);

    const [item] = await useCase.execute({ limit: 200 });

    expect(Object.keys(item).sort()).toEqual(
      [
        'clienteId',
        'estadoConversa',
        'estadoAtualizadoEm',
        'urgencia',
        'vendedoraSugeridaCodigo',
        'vendedoraAprovadaCodigo',
        'primeiroContatoEm',
      ].sort(),
    );

    const proibidas = [
      'whatsapp',
      'whatsappHash',
      'nome',
      'telefone',
      'telefone1',
      'email',
      'intencaoCompra',
      'notasInternas',
      'wishlist',
      'resumoTriagem',
    ];
    for (const chave of proibidas) {
      expect(item).not.toHaveProperty(chave);
    }

    // Serializacao do JSON inteiro nao pode conter os valores sensiveis.
    const serializado = JSON.stringify(item);
    expect(serializado).not.toContain('85988887777');
    expect(serializado).not.toContain('hash-secreto');
    expect(serializado).not.toContain('anel de noivado');
    expect(serializado).not.toContain('nota sensivel');
  });

  it('estadoAtualizadoEm vira null quando o perfil nao tem timestamp', async () => {
    const perfil = ClientePerfil.create({
      clienteId: 'c-sem-ts',
      estadoConversa: 'READY_FOR_ROUTING',
      estadoAtualizadoEm: undefined,
    });
    repo.listarPorEstados.mockResolvedValue([perfil]);

    const [item] = await useCase.execute({ limit: 200 });

    expect(item.estadoAtualizadoEm).toBeNull();
  });

  describe('primeiroContatoEm (parada do relogio de SLA)', () => {
    it('expoe primeiroContatoEm como ISO quando preenchido', async () => {
      const perfil = makePerfil(
        'c-contatado',
        'IN_HUMAN_SERVICE',
        new Date('2026-01-01T08:00:00Z'),
        new Date('2026-01-01T09:30:00Z'),
      );
      repo.listarPorEstados.mockResolvedValue([perfil]);

      const [item] = await useCase.execute({ limit: 200 });

      expect(item.primeiroContatoEm).toBe('2026-01-01T09:30:00.000Z');
    });

    it('primeiroContatoEm e null quando o relogio ainda roda', async () => {
      const perfil = makePerfil(
        'c-aguardando',
        'IN_HUMAN_SERVICE',
        new Date('2026-01-01T08:00:00Z'),
        null,
      );
      repo.listarPorEstados.mockResolvedValue([perfil]);

      const [item] = await useCase.execute({ limit: 200 });

      expect(item.primeiroContatoEm).toBeNull();
    });

    // A exclusao das linhas IN_HUMAN_SERVICE ja contatadas e responsabilidade
    // da query do repositorio (filtro SQL NOT (...)). O use case apenas repassa
    // o que o repositorio devolve, na ordem em que veio. Aqui garantimos que,
    // dado o conjunto ja filtrado pelo repo, a Sofia ve os nao-contatados e o
    // campo de parada do relogio em cada item.
    it('preserva os nao-contatados e o campo de parada vindos do repositorio', async () => {
      const semContato = makePerfil(
        'c-sem-contato',
        'IN_HUMAN_SERVICE',
        new Date('2026-01-01T08:00:00Z'),
        null,
      );
      const routing = makePerfil(
        'c-routing',
        'READY_FOR_ROUTING',
        new Date('2026-01-01T07:00:00Z'),
        null,
      );
      repo.listarPorEstados.mockResolvedValue([routing, semContato]);

      const resultado = await useCase.execute({ limit: 200 });

      expect(resultado.map((r) => r.clienteId)).toEqual([
        'c-routing',
        'c-sem-contato',
      ]);
      expect(resultado.every((r) => r.primeiroContatoEm === null)).toBe(true);
    });
  });
});
