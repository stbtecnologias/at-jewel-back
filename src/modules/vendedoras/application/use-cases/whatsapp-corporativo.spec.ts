import { randomBytes } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { CriarVendedoraUseCase } from './criar-vendedora.use-case';
import { AtualizarVendedoraUseCase } from './atualizar-vendedora.use-case';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import type { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';

/**
 * O SEGUNDO NUMERO DA VENDEDORA — o corporativo.
 *
 * ==========================================================================
 * A COLUNA EXISTIA DESDE 25/08 E FICOU MORTA ATE 08/09.
 *
 * A migracao 39 criou `whatsapp_externo`, o indice unico e o CHECK de "os dois
 * distintos", e escreveu no proprio cabecalho o que faltaria fazer quando a
 * aplicacao passasse a usar os dois campos:
 *
 *   "Quando o roteamento passar a reconhecer os dois campos, essa checagem
 *    PRECISA olhar os dois — senao a colisao entre pessoal de uma e
 *    corporativo de outra vira ambiguidade de identidade no canal."
 *
 * Este arquivo e o cumprimento daquele bilhete. Sem ele, o que quebra e
 * silencioso: duas vendedoras casando com o mesmo telefone, e a Elena
 * respondendo a uma delas por ordem de consulta.
 * ==========================================================================
 */
describe('O WhatsApp corporativo da vendedora', () => {
  const ORIGINAL_ENV = { ...process.env };
  let repo: jest.Mocked<IVendedoraRepository>;

  function repoVazio(): jest.Mocked<IVendedoraRepository> {
    return {
      criar: jest.fn((v) => Promise.resolve(v)),
      buscarPorId: jest.fn().mockResolvedValue(null),
      buscarPorIdErp: jest.fn().mockResolvedValue(null),
      buscarPorCodigoErp: jest.fn().mockResolvedValue(null),
      proximoCodigoInterno: jest.fn().mockResolvedValue('AT-0001'),
      buscarPorEmailHash: jest.fn().mockResolvedValue(null),
      buscarPorWhatsappHash: jest.fn().mockResolvedValue(null),
      listar: jest.fn().mockResolvedValue([]),
      atualizar: jest.fn((v) => Promise.resolve(v)),
      remover: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IVendedoraRepository>;
  }

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.HASH_SECRET = randomBytes(32).toString('hex');
    repo = repoVazio();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('ao criar', () => {
    it('grava o corporativo e calcula o hash normalizado', async () => {
      const uc = new CriarVendedoraUseCase(repo);

      await uc.execute({
        nome: 'Marina',
        whatsappInterno: '(85) 9 8888-7777',
        whatsappExterno: '(85) 9 7777-6666',
      });

      const criada = repo.criar.mock.calls[0][0];
      expect(criada.whatsappExterno).toBe('(85) 9 7777-6666');
      expect(criada.whatsappExternoHash).toMatch(/^[0-9a-f]{64}$/);
      // Numeros diferentes, hashes diferentes.
      expect(criada.whatsappExternoHash).not.toBe(criada.whatsappInternoHash);
    });

    /**
     * Nao e erro de digitacao inofensivo: significaria que o celular PESSOAL
     * dela esta exposto a cliente, ou que o corporativo virou canal da IA sem
     * ninguem ter decidido isso.
     */
    it('recusa o MESMO numero nos dois campos', async () => {
      const uc = new CriarVendedoraUseCase(repo);

      await expect(
        uc.execute({
          nome: 'Marina',
          whatsappInterno: '(85) 9 8888-7777',
          whatsappExterno: '85988887777',
        }),
      ).rejects.toThrow(ConflictException);
    });

    /** O corporativo tambem passa pela checagem de duplicata. */
    it('recusa corporativo que ja pertence a outra vendedora', async () => {
      repo.buscarPorWhatsappHash.mockResolvedValue(
        Vendedora.create({
          id: 'outra',
          nome: 'Bianca',
          tipo: 'LOCAL',
          ativo: true,
          statusDisponibilidade: 'DISPONIVEL',
        }),
      );
      const uc = new CriarVendedoraUseCase(repo);

      await expect(
        uc.execute({ nome: 'Marina', whatsappExterno: '85977776666' }),
      ).rejects.toThrow(ConflictException);
      expect(repo.criar).not.toHaveBeenCalled();
    });

    it('sem corporativo, os campos ficam nulos e nada e recusado', async () => {
      const uc = new CriarVendedoraUseCase(repo);

      await uc.execute({ nome: 'Marina', whatsappInterno: '85988887777' });

      const criada = repo.criar.mock.calls[0][0];
      expect(criada.whatsappExterno).toBeNull();
      expect(criada.whatsappExternoHash).toBeNull();
    });
  });

  describe('ao atualizar', () => {
    const atual = Vendedora.create({
      id: 'vd-1',
      nome: 'Marina',
      tipo: 'LOCAL',
      ativo: true,
      statusDisponibilidade: 'DISPONIVEL',
      whatsappInterno: '85988887777',
      whatsappInternoHash: 'hash-interno',
    });

    beforeEach(() => {
      repo.buscarPorId.mockResolvedValue(atual);
    });

    it('grava o corporativo novo sem mexer no interno', async () => {
      const uc = new AtualizarVendedoraUseCase(repo);

      await uc.execute('vd-1', { whatsappExterno: '85977776666' });

      const salva = repo.atualizar.mock.calls[0][0];
      expect(salva.whatsappExterno).toBe('85977776666');
      expect(salva.whatsappExternoHash).toMatch(/^[0-9a-f]{64}$/);
      expect(salva.whatsappInterno).toBe('85988887777');
      expect(salva.whatsappInternoHash).toBe('hash-interno');
    });

    /**
     * O CASO QUE O `input` SOZINHO NAO PEGA.
     *
     * O PATCH manda so o corporativo; o interno que ele colide nem veio na
     * requisicao. Comparar apenas o que chegou deixaria isso passar para o
     * CHECK do banco, que responderia 500 com stack do Postgres.
     */
    it('recusa corporativo igual ao interno JA GRAVADO', async () => {
      const uc = new AtualizarVendedoraUseCase(repo);

      await expect(
        uc.execute('vd-1', { whatsappExterno: '(85) 9 8888-7777' }),
      ).rejects.toThrow(ConflictException);
      expect(repo.atualizar).not.toHaveBeenCalled();
    });

    it('apagar o corporativo limpa o hash junto', async () => {
      repo.buscarPorId.mockResolvedValue(
        Vendedora.create({
          ...atual,
          whatsappExterno: '85977776666',
          whatsappExternoHash: 'hash-externo',
        }),
      );
      const uc = new AtualizarVendedoraUseCase(repo);

      await uc.execute('vd-1', { whatsappExterno: null });

      const salva = repo.atualizar.mock.calls[0][0];
      expect(salva.whatsappExterno).toBeNull();
      expect(salva.whatsappExternoHash).toBeNull();
    });

    /** Nao mandar o campo nao pode apagar o que ja estava la. */
    it('PATCH sem o campo preserva o corporativo', async () => {
      repo.buscarPorId.mockResolvedValue(
        Vendedora.create({
          ...atual,
          whatsappExterno: '85977776666',
          whatsappExternoHash: 'hash-externo',
        }),
      );
      const uc = new AtualizarVendedoraUseCase(repo);

      await uc.execute('vd-1', { nome: 'Marina Duarte' });

      const salva = repo.atualizar.mock.calls[0][0];
      expect(salva.whatsappExterno).toBe('85977776666');
      expect(salva.whatsappExternoHash).toBe('hash-externo');
    });
  });
});
