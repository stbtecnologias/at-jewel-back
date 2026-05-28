import { UnprocessableEntityException } from '@nestjs/common';
import { AgenteEvento } from '../../domain/entities/agente-evento.entity';
import { IAgenteEventoRepository } from '../../domain/ports/repositories/agente-evento-repository.port';
import { RegistrarEventoUseCase } from './registrar-evento.use-case';

function makeRepoMock(): jest.Mocked<IAgenteEventoRepository> {
  return {
    registrar: jest.fn(),
    listar: jest.fn(),
  } as unknown as jest.Mocked<IAgenteEventoRepository>;
}

describe('RegistrarEventoUseCase', () => {
  let useCase: RegistrarEventoUseCase;
  let repo: jest.Mocked<IAgenteEventoRepository>;

  beforeEach(() => {
    repo = makeRepoMock();
    useCase = new RegistrarEventoUseCase(repo);
  });

  it('registra evento sem payload', async () => {
    repo.registrar.mockImplementation((e) => Promise.resolve(e));

    const e = await useCase.execute({
      agente: 'anastasia',
      tipoEvento: 'triagem_iniciada',
      clienteId: 'uuid-cli',
      correlationId: 'uuid-corr',
    });

    expect(e.agente).toBe('anastasia');
    expect(e.tipoEvento).toBe('triagem_iniciada');
    expect(e.payload).toBeNull();
  });

  it('registra evento com payload operacional (sem PII)', async () => {
    repo.registrar.mockImplementation((e) => Promise.resolve(e));

    await useCase.execute({
      agente: 'anastasia',
      tipoEvento: 'transicao_estado',
      payload: {
        estado_anterior: 'TRIAGE_IN_PROGRESS',
        estado_novo: 'READY_FOR_ROUTING',
        tempo_total_segundos: 245,
      },
    });

    expect(repo.registrar).toHaveBeenCalled();
  });

  describe('deteccao de PII (rejeita com 422)', () => {
    it('rejeita payload com telefone', async () => {
      await expect(
        useCase.execute({
          agente: 'anastasia',
          tipoEvento: 'msg',
          payload: { qualquer: '(85) 9 8888-7777' },
        }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(repo.registrar).not.toHaveBeenCalled();
    });

    it('rejeita payload com email', async () => {
      await expect(
        useCase.execute({
          agente: 'anastasia',
          tipoEvento: 'msg',
          payload: { foo: 'maria@email.com' },
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejeita payload com CPF', async () => {
      await expect(
        useCase.execute({
          agente: 'anastasia',
          tipoEvento: 'msg',
          payload: { campo: '123.456.789-00' },
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejeita chave proibida mesmo com valor inocente', async () => {
      await expect(
        useCase.execute({
          agente: 'anastasia',
          tipoEvento: 'msg',
          payload: { mensagem: 'oi' },
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejeita PII em estrutura aninhada', async () => {
      await expect(
        useCase.execute({
          agente: 'anastasia',
          tipoEvento: 'msg',
          payload: {
            contexto: {
              detalhes: {
                contact: '85988887777',
              },
            },
          },
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejeita PII em array', async () => {
      await expect(
        useCase.execute({
          agente: 'anastasia',
          tipoEvento: 'msg',
          payload: { items: ['ok', 'maria@email.com'] },
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('aceita IDs UUID-like (nao sao PII)', async () => {
      repo.registrar.mockImplementation((e) => Promise.resolve(e));

      await expect(
        useCase.execute({
          agente: 'anastasia',
          tipoEvento: 'vendedora_sugerida',
          payload: { vendedora_id: 'a1b2c3d4-1234-5678-9abc-def012345678', score: 0.87 },
        }),
      ).resolves.toBeDefined();
    });
  });
});
