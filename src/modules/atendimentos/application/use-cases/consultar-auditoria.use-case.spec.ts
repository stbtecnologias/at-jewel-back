import { NotFoundException } from '@nestjs/common';
import {
  ConsultarAuditoriaUseCase,
  MAXIMO_POR_PAGINA,
} from './consultar-auditoria.use-case';

/**
 * A leitura de auditoria.
 *
 * O QUE ESTE ARQUIVO PROTEGE: o teto de pagina. Quem chama de fora escolhe o
 * `limit`, e sem corte um `?limit=100000` traria a base inteira COM O RELATO
 * DECIFRADO de cada atendimento — a vida da cliente dita em voz alta, num
 * unico JSON. O corte nao e desempenho, e contencao.
 */
describe('ConsultarAuditoriaUseCase', () => {
  let repo: {
    listarAuditoria: jest.Mock;
    resumoAuditoria: jest.Mock;
    listarInteracoes: jest.Mock;
  };
  let uc: ConsultarAuditoriaUseCase;

  const PAGINA_VAZIA = { itens: [], total: 0 };

  beforeEach(() => {
    repo = {
      listarAuditoria: jest.fn().mockResolvedValue(PAGINA_VAZIA),
      resumoAuditoria: jest.fn().mockResolvedValue({
        total: 0,
        porEtapa: {},
        vendedoras: [],
      }),
      listarInteracoes: jest.fn().mockResolvedValue([]),
    };
    uc = new ConsultarAuditoriaUseCase(repo as never);
  });

  describe('teto de pagina', () => {
    it('corta um limit exagerado no maximo', async () => {
      await uc.listar({ limit: 100_000 });

      expect(repo.listarAuditoria).toHaveBeenCalledWith(
        expect.objectContaining({ limit: MAXIMO_POR_PAGINA }),
      );
    });

    it('respeita um limit menor que o teto', async () => {
      await uc.listar({ limit: 10 });

      expect(repo.listarAuditoria).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('sem limit, usa o padrao — e nunca "todos"', async () => {
      await uc.listar({});

      const [args] = repo.listarAuditoria.mock.calls[0];
      expect(args.limit).toBeGreaterThan(0);
      expect(args.limit).toBeLessThanOrEqual(MAXIMO_POR_PAGINA);
      expect(args.offset).toBe(0);
    });
  });

  describe('filtros', () => {
    it('repassa vendedora, cliente, etapa e janela', async () => {
      const de = new Date('2026-08-01T00:00:00Z');
      const ate = new Date('2026-08-31T23:59:59Z');

      await uc.listar({
        vendedoraId: 'vd-1',
        clienteNome: 'luana',
        etapa: 'EM_NEGOCIACAO',
        de,
        ate,
      });

      expect(repo.listarAuditoria).toHaveBeenCalledWith(
        expect.objectContaining({
          vendedoraId: 'vd-1',
          clienteNome: 'luana',
          etapa: 'EM_NEGOCIACAO',
          de,
          ate,
        }),
      );
    });
  });

  describe('detalhe', () => {
    it('junta o cabecalho da view com a linha do tempo', async () => {
      repo.listarAuditoria.mockResolvedValue({
        total: 1,
        itens: [{ id: 'at-1', clienteNome: 'Luana Ferreira', etapa: 'REMARCADO' }],
      });
      repo.listarInteracoes.mockResolvedValue([
        { id: 'i-1', tipo: 'ENCAMINHADO' },
        { id: 'i-2', tipo: 'RELATO' },
      ]);

      const r = await uc.detalhe('at-1');

      expect(r.clienteNome).toBe('Luana Ferreira');
      // A etapa vem da VIEW, nao recalculada aqui: uma definicao so.
      expect(r.etapa).toBe('REMARCADO');
      expect(r.interacoes).toHaveLength(2);
      expect(repo.listarAuditoria).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'at-1' }),
      );
    });

    it('id que nao existe vira 404, e nao um objeto meio vazio', async () => {
      repo.listarAuditoria.mockResolvedValue(PAGINA_VAZIA);

      await expect(uc.detalhe('at-inexistente')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
