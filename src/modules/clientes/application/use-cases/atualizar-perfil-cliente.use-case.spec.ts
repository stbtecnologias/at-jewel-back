import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Cliente } from '../../domain/entities/cliente.entity';
import { ClientePerfil } from '../../domain/entities/cliente-perfil.entity';
import { EstadoConversaAgente } from '../../domain/entities/enums';
import { IClientePerfilRepository } from '../../domain/ports/repositories/cliente-perfil-repository.port';
import { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { AtualizarPerfilClienteUseCase } from './atualizar-perfil-cliente.use-case';

function makeClienteRepoMock(): jest.Mocked<IClienteRepository> {
  return {
    criarComPerfil: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    buscarPorTelefone1Hash: jest.fn(),
    buscarPorEmailHash: jest.fn(),
    listar: jest.fn(),
    atualizar: jest.fn(),
  } as unknown as jest.Mocked<IClienteRepository>;
}

function makePerfilRepoMock(): jest.Mocked<IClientePerfilRepository> {
  return {
    buscarPorClienteId: jest.fn(),
    buscarPorWhatsappHash: jest.fn(),
    atualizar: jest.fn(),
    deletar: jest.fn(),
  } as unknown as jest.Mocked<IClientePerfilRepository>;
}

function makePerfil(estado: EstadoConversaAgente, overrides: Partial<ClientePerfil> = {}) {
  return ClientePerfil.create({
    clienteId: 'uuid-cliente',
    whatsapp: '85988887777',
    whatsappHash: 'hash',
    origemContato: 'whatsapp',
    estadoConversa: estado,
    estadoAtualizadoEm: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

function makeClienteRetorno(perfil: ClientePerfil): Cliente {
  return Cliente.create({
    id: 'uuid-cliente',
    nome: 'Maria',
    tipoPessoa: 'fisica',
    tabelaPreco: 'varejo',
    ativo: true,
    perfil,
  });
}

describe('AtualizarPerfilClienteUseCase', () => {
  let useCase: AtualizarPerfilClienteUseCase;
  let clienteRepo: jest.Mocked<IClienteRepository>;
  let perfilRepo: jest.Mocked<IClientePerfilRepository>;

  beforeEach(() => {
    clienteRepo = makeClienteRepoMock();
    perfilRepo = makePerfilRepoMock();
    useCase = new AtualizarPerfilClienteUseCase(clienteRepo, perfilRepo);
  });

  it('lanca NotFoundException se perfil nao existe', async () => {
    perfilRepo.buscarPorClienteId.mockResolvedValue(null);

    await expect(useCase.execute('uuid-inexistente', {})).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('transicoes de estado', () => {
    it('aceita transicao valida (TRIAGE_IN_PROGRESS -> READY_FOR_ROUTING)', async () => {
      const perfilAtual = makePerfil('TRIAGE_IN_PROGRESS');
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);
      perfilRepo.atualizar.mockResolvedValue(perfilAtual);
      clienteRepo.buscarPorId.mockResolvedValue(makeClienteRetorno(perfilAtual));

      await useCase.execute('uuid-cliente', { estadoConversa: 'READY_FOR_ROUTING' });

      const perfilSalvo = perfilRepo.atualizar.mock.calls[0][0];
      expect(perfilSalvo.estadoConversa).toBe('READY_FOR_ROUTING');
    });

    it('rejeita transicao invalida com 422', async () => {
      const perfilAtual = makePerfil('IN_HUMAN_SERVICE');
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);

      await expect(
        useCase.execute('uuid-cliente', { estadoConversa: 'TRIAGE_IN_PROGRESS' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejeita pular de TRIAGE_IN_PROGRESS direto para IN_HUMAN_SERVICE', async () => {
      const perfilAtual = makePerfil('TRIAGE_IN_PROGRESS');
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);

      await expect(
        useCase.execute('uuid-cliente', { estadoConversa: 'IN_HUMAN_SERVICE' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('atualiza estado_atualizado_em quando estado muda', async () => {
      const perfilAtual = makePerfil('TRIAGE_IN_PROGRESS', {
        estadoAtualizadoEm: new Date('2026-01-01T00:00:00Z'),
      } as Partial<ClientePerfil>);
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);
      perfilRepo.atualizar.mockResolvedValue(perfilAtual);
      clienteRepo.buscarPorId.mockResolvedValue(makeClienteRetorno(perfilAtual));

      const antes = new Date();
      await useCase.execute('uuid-cliente', { estadoConversa: 'READY_FOR_ROUTING' });
      const depois = new Date();

      const perfilSalvo = perfilRepo.atualizar.mock.calls[0][0];
      expect(perfilSalvo.estadoAtualizadoEm!.getTime()).toBeGreaterThanOrEqual(antes.getTime());
      expect(perfilSalvo.estadoAtualizadoEm!.getTime()).toBeLessThanOrEqual(depois.getTime());
    });

    it('mantem estado_atualizado_em quando o estado NAO muda', async () => {
      const dataOriginal = new Date('2026-01-01T00:00:00Z');
      const perfilAtual = makePerfil('TRIAGE_IN_PROGRESS', {
        estadoAtualizadoEm: dataOriginal,
      } as Partial<ClientePerfil>);
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);
      perfilRepo.atualizar.mockResolvedValue(perfilAtual);
      clienteRepo.buscarPorId.mockResolvedValue(makeClienteRetorno(perfilAtual));

      // Atualiza outro campo, nao mexe no estado.
      await useCase.execute('uuid-cliente', { urgencia: 'imediata' });

      const perfilSalvo = perfilRepo.atualizar.mock.calls[0][0];
      expect(perfilSalvo.estadoAtualizadoEm).toEqual(dataOriginal);
    });

    it('permite retornar de WAITING_OWNER_APPROVAL para READY_FOR_ROUTING (recusa)', async () => {
      const perfilAtual = makePerfil('WAITING_OWNER_APPROVAL');
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);
      perfilRepo.atualizar.mockResolvedValue(perfilAtual);
      clienteRepo.buscarPorId.mockResolvedValue(makeClienteRetorno(perfilAtual));

      await expect(
        useCase.execute('uuid-cliente', { estadoConversa: 'READY_FOR_ROUTING' }),
      ).resolves.toBeDefined();
    });
  });

  describe('coerencia tipo_compra x motivacao_compra', () => {
    it('rejeita motivacao=presente com tipo=pessoal', async () => {
      const perfilAtual = makePerfil('TRIAGE_IN_PROGRESS', {
        tipoCompra: 'pessoal',
      } as Partial<ClientePerfil>);
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);

      await expect(
        useCase.execute('uuid-cliente', { motivacaoCompra: 'presente' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejeita tipo=presente com motivacao=status', async () => {
      const perfilAtual = makePerfil('TRIAGE_IN_PROGRESS');
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);

      await expect(
        useCase.execute('uuid-cliente', {
          tipoCompra: 'presente',
          motivacaoCompra: 'status',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('aceita motivacao=uso_proprio com tipo=pessoal', async () => {
      const perfilAtual = makePerfil('TRIAGE_IN_PROGRESS');
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);
      perfilRepo.atualizar.mockResolvedValue(perfilAtual);
      clienteRepo.buscarPorId.mockResolvedValue(makeClienteRetorno(perfilAtual));

      await expect(
        useCase.execute('uuid-cliente', {
          tipoCompra: 'pessoal',
          motivacaoCompra: 'uso_proprio',
        }),
      ).resolves.toBeDefined();
    });

    it('aceita motivacao=presente com tipo=presente', async () => {
      const perfilAtual = makePerfil('TRIAGE_IN_PROGRESS');
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);
      perfilRepo.atualizar.mockResolvedValue(perfilAtual);
      clienteRepo.buscarPorId.mockResolvedValue(makeClienteRetorno(perfilAtual));

      await expect(
        useCase.execute('uuid-cliente', {
          tipoCompra: 'presente',
          motivacaoCompra: 'presente',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('merge de campos', () => {
    it('atualiza apenas campos fornecidos, preserva os outros', async () => {
      const perfilAtual = makePerfil('TRIAGE_IN_PROGRESS', {
        urgencia: 'imediata',
        nivelConhecimento: 'iniciante',
      } as Partial<ClientePerfil>);
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);
      perfilRepo.atualizar.mockResolvedValue(perfilAtual);
      clienteRepo.buscarPorId.mockResolvedValue(makeClienteRetorno(perfilAtual));

      await useCase.execute('uuid-cliente', { nivelConhecimento: 'conhecedor' });

      const perfilSalvo = perfilRepo.atualizar.mock.calls[0][0];
      expect(perfilSalvo.nivelConhecimento).toBe('conhecedor');
      expect(perfilSalvo.urgencia).toBe('imediata'); // preservado
    });

    it('permite zerar campo explicitamente com null', async () => {
      const perfilAtual = makePerfil('TRIAGE_IN_PROGRESS', {
        urgencia: 'imediata',
      } as Partial<ClientePerfil>);
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);
      perfilRepo.atualizar.mockResolvedValue(perfilAtual);
      clienteRepo.buscarPorId.mockResolvedValue(makeClienteRetorno(perfilAtual));

      await useCase.execute('uuid-cliente', { urgencia: null });

      const perfilSalvo = perfilRepo.atualizar.mock.calls[0][0];
      expect(perfilSalvo.urgencia).toBeNull();
    });
  });

  describe('primeiroContatoEm (parada do relogio de SLA)', () => {
    it('grava primeiroContatoEm quando informado', async () => {
      const perfilAtual = makePerfil('IN_HUMAN_SERVICE');
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);
      perfilRepo.atualizar.mockResolvedValue(perfilAtual);
      clienteRepo.buscarPorId.mockResolvedValue(makeClienteRetorno(perfilAtual));

      const contato = new Date('2026-01-02T10:00:00Z');
      await useCase.execute('uuid-cliente', { primeiroContatoEm: contato });

      const perfilSalvo = perfilRepo.atualizar.mock.calls[0][0];
      expect(perfilSalvo.primeiroContatoEm).toEqual(contato);
    });

    it('limpa primeiroContatoEm quando recebe null', async () => {
      const perfilAtual = makePerfil('IN_HUMAN_SERVICE', {
        primeiroContatoEm: new Date('2026-01-02T10:00:00Z'),
      } as Partial<ClientePerfil>);
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);
      perfilRepo.atualizar.mockResolvedValue(perfilAtual);
      clienteRepo.buscarPorId.mockResolvedValue(makeClienteRetorno(perfilAtual));

      await useCase.execute('uuid-cliente', { primeiroContatoEm: null });

      const perfilSalvo = perfilRepo.atualizar.mock.calls[0][0];
      expect(perfilSalvo.primeiroContatoEm).toBeNull();
    });

    it('preserva primeiroContatoEm quando nao informado (undefined)', async () => {
      const original = new Date('2026-01-02T10:00:00Z');
      const perfilAtual = makePerfil('IN_HUMAN_SERVICE', {
        primeiroContatoEm: original,
      } as Partial<ClientePerfil>);
      perfilRepo.buscarPorClienteId.mockResolvedValue(perfilAtual);
      perfilRepo.atualizar.mockResolvedValue(perfilAtual);
      clienteRepo.buscarPorId.mockResolvedValue(makeClienteRetorno(perfilAtual));

      // Atualiza outro campo, nao mexe no primeiroContatoEm.
      await useCase.execute('uuid-cliente', { urgencia: 'imediata' });

      const perfilSalvo = perfilRepo.atualizar.mock.calls[0][0];
      expect(perfilSalvo.primeiroContatoEm).toEqual(original);
    });
  });
});
