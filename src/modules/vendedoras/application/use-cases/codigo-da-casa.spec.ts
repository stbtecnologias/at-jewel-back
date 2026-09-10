import { randomBytes } from 'crypto';
import { CriarVendedoraUseCase } from './criar-vendedora.use-case';
import { AtualizarVendedoraUseCase } from './atualizar-vendedora.use-case';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import type { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';

/**
 * O CÓDIGO DA CASA — `AT-####`.
 *
 * ==========================================================================
 * ELE NÃO É UM RÓTULO. É A CHAVE DA CARTEIRA.
 *
 * A FK `fk_clientes_vendedora_codigo` (migração 29) liga cliente a vendedora
 * POR ESTE CAMPO. Vendedora sem código não pode ter cliente nenhum — não é
 * limitação de tela, é chave estrangeira.
 *
 * Enquanto o cadastro vinha do ERP isso não incomodava: o código vinha de lá.
 * Com a vendedora nascendo no CRM, alguém tem que gerar — e o prefixo `AT-`
 * diz a origem de relance.
 *
 * TROCAR É SEGURO, e é o que estes testes protegem junto: a FK tem ON UPDATE
 * CASCADE, então mudar o código leva os clientes junto. É isso que permite ela
 * nascer `AT-0007` aqui e receber o código do ERP depois, sem perder ninguém.
 * ==========================================================================
 */
describe('O código da casa', () => {
  const ORIGINAL_ENV = { ...process.env };
  let repo: jest.Mocked<IVendedoraRepository>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.HASH_SECRET = randomBytes(32).toString('hex');
    repo = {
      criar: jest.fn((v) => Promise.resolve(v)),
      buscarPorId: jest.fn().mockResolvedValue(null),
      buscarPorIdErp: jest.fn().mockResolvedValue(null),
      buscarPorCodigoErp: jest.fn().mockResolvedValue(null),
      proximoCodigoInterno: jest.fn().mockResolvedValue('AT-0009'),
      buscarPorEmailHash: jest.fn().mockResolvedValue(null),
      buscarPorWhatsappHash: jest.fn().mockResolvedValue(null),
      listar: jest.fn().mockResolvedValue([]),
      atualizar: jest.fn((v) => Promise.resolve(v)),
      remover: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IVendedoraRepository>;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('ao criar', () => {
    it('sem código informado, a casa gera', async () => {
      const uc = new CriarVendedoraUseCase(repo);

      await uc.execute({ nome: 'Aline' });

      expect(repo.criar.mock.calls[0][0].codigoErp).toBe('AT-0009');
    });

    it('com código informado, respeita o que veio', async () => {
      const uc = new CriarVendedoraUseCase(repo);

      await uc.execute({ nome: 'Aline', codigoErp: 'LA-07' });

      expect(repo.criar.mock.calls[0][0].codigoErp).toBe('LA-07');
      expect(repo.proximoCodigoInterno).not.toHaveBeenCalled();
    });
  });

  describe('ao atualizar', () => {
    function existente(codigoErp: string | null) {
      return Vendedora.create({
        id: 'vd-1',
        nome: 'Aline',
        tipo: 'LOCAL',
        ativo: true,
        statusDisponibilidade: 'DISPONIVEL',
        codigoErp,
      });
    }

    /**
     * O caso da Aline, cadastrada antes de a geração existir: salvar sem
     * informar código tem de dar um a ela, senão fica para sempre sem carteira.
     */
    it('quem já existia sem código ganha um ao ser salva', async () => {
      repo.buscarPorId.mockResolvedValue(existente(null));
      const uc = new AtualizarVendedoraUseCase(repo);

      await uc.execute('vd-1', { nome: 'Aline Keppler' });

      expect(repo.atualizar.mock.calls[0][0].codigoErp).toBe('AT-0009');
    });

    /** O dia em que o ERP trouxer a vendedora: os clientes vão junto, por
     *  causa do ON UPDATE CASCADE. */
    it('troca o AT-#### pelo código do ERP', async () => {
      repo.buscarPorId.mockResolvedValue(existente('AT-0009'));
      const uc = new AtualizarVendedoraUseCase(repo);

      await uc.execute('vd-1', { codigoErp: 'LA-07' });

      expect(repo.atualizar.mock.calls[0][0].codigoErp).toBe('LA-07');
    });

    /**
     * APAGAR NÃO É OPÇÃO. Campo em branco devolve o código atual, nunca o
     * vazio: sem código ela perde a carteira inteira, e ninguém quer dizer
     * isso limpando um campo.
     */
    it('limpar o campo NÃO apaga o código', async () => {
      repo.buscarPorId.mockResolvedValue(existente('LA-07'));
      const uc = new AtualizarVendedoraUseCase(repo);

      await uc.execute('vd-1', { codigoErp: '' });

      expect(repo.atualizar.mock.calls[0][0].codigoErp).toBe('LA-07');
    });

    it('não mandar o campo preserva o código', async () => {
      repo.buscarPorId.mockResolvedValue(existente('LA-07'));
      const uc = new AtualizarVendedoraUseCase(repo);

      await uc.execute('vd-1', { nome: 'Aline Keppler' });

      expect(repo.atualizar.mock.calls[0][0].codigoErp).toBe('LA-07');
      expect(repo.proximoCodigoInterno).not.toHaveBeenCalled();
    });

    it('recusa código que já é de outra vendedora', async () => {
      repo.buscarPorId.mockResolvedValue(existente('AT-0009'));
      repo.buscarPorCodigoErp.mockResolvedValue(existente('LA-07'));
      const uc = new AtualizarVendedoraUseCase(repo);

      // A busca devolve OUTRA vendedora com o mesmo código.
      repo.buscarPorCodigoErp.mockResolvedValue(
        Vendedora.create({
          id: 'vd-outra',
          nome: 'Bianca',
          tipo: 'LOCAL',
          ativo: true,
          statusDisponibilidade: 'DISPONIVEL',
          codigoErp: 'LA-07',
        }),
      );

      await expect(uc.execute('vd-1', { codigoErp: 'LA-07' })).rejects.toThrow();
      expect(repo.atualizar).not.toHaveBeenCalled();
    });
  });
});
