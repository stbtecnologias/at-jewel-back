import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EncerrarPorSilencioUseCase } from './encerrar-por-silencio.use-case';
import { ReabrirAtendimentoUseCase } from './reabrir-atendimento.use-case';

/**
 * A BAIXA POR SILÊNCIO, E O DESFAZER QUE A TORNA ACEITÁVEL.
 *
 * Os dois nasceram juntos e por causa um do outro: fechar atendimento sem
 * ninguém mandar só é aceitável se der para desfazer. Fechamento silencioso e
 * irreversível é a pior combinação — o episódio some da fila, ninguém vê erro
 * na tela, e a cliente cai do acompanhamento.
 */
describe('Encerrar por silêncio', () => {
  let repo: {
    listarSilenciosos: jest.Mock;
    fechar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarAbertoPorCliente: jest.Mock;
    reabrir: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      listarSilenciosos: jest.fn().mockResolvedValue([]),
      fechar: jest.fn().mockResolvedValue(undefined),
      buscarPorId: jest.fn().mockResolvedValue(null),
      buscarAbertoPorCliente: jest.fn().mockResolvedValue(null),
      reabrir: jest.fn().mockResolvedValue(undefined),
    };
  });

  describe('a varredura', () => {
    /** 48h é o mesmo prazo do canal pessoal (`HORAS_RETOMADA`), de propósito. */
    it('pergunta pelas 48 horas da regra da casa', async () => {
      const uc = new EncerrarPorSilencioUseCase(repo as never);

      await uc.execute();

      expect(repo.listarSilenciosos).toHaveBeenCalledWith(48, expect.any(Number));
    });

    it('fecha por INATIVIDADE, e não por SEM_VENDA', async () => {
      repo.listarSilenciosos.mockResolvedValue(['at-1', 'at-2']);
      const uc = new EncerrarPorSilencioUseCase(repo as never);

      const r = await uc.execute();

      expect(r.encerrados).toBe(2);
      expect(repo.fechar).toHaveBeenCalledWith('at-1', 'INATIVIDADE');
      expect(repo.fechar).toHaveBeenCalledWith('at-2', 'INATIVIDADE');
    });

    it('nada silencioso, nada fechado', async () => {
      const uc = new EncerrarPorSilencioUseCase(repo as never);

      const r = await uc.execute();

      expect(r.encerrados).toBe(0);
      expect(repo.fechar).not.toHaveBeenCalled();
    });

    /** Um que falha não leva os outros junto — a rodada seguinte tenta de novo,
     *  porque ele continua aparecendo na consulta. */
    it('uma falha não derruba a rodada', async () => {
      repo.listarSilenciosos.mockResolvedValue(['at-1', 'at-2', 'at-3']);
      repo.fechar.mockRejectedValueOnce(new Error('banco fora'));
      const uc = new EncerrarPorSilencioUseCase(repo as never);

      const r = await uc.execute();

      expect(r.encerrados).toBe(2);
      expect(repo.fechar).toHaveBeenCalledTimes(3);
    });
  });

  describe('reabrir', () => {
    it('desfaz o fechamento', async () => {
      repo.buscarPorId.mockResolvedValue({
        id: 'at-1',
        clienteId: 'cli-1',
        fechadoEm: new Date(),
        desfecho: 'INATIVIDADE',
      });
      const uc = new ReabrirAtendimentoUseCase(repo as never);

      await uc.execute('at-1');

      expect(repo.reabrir).toHaveBeenCalledWith('at-1');
    });

    it('recusa atendimento que não existe', async () => {
      const uc = new ReabrirAtendimentoUseCase(repo as never);
      await expect(uc.execute('at-1')).rejects.toThrow(NotFoundException);
    });

    /** Quem clicou acha que desfez alguma coisa. Dizer que não havia o que
     *  desfazer é a resposta. */
    it('recusa atendimento que já está aberto', async () => {
      repo.buscarPorId.mockResolvedValue({
        id: 'at-1',
        clienteId: 'cli-1',
        fechadoEm: null,
        desfecho: null,
      });
      const uc = new ReabrirAtendimentoUseCase(repo as never);

      await expect(uc.execute('at-1')).rejects.toThrow(BadRequestException);
      expect(repo.reabrir).not.toHaveBeenCalled();
    });

    /**
     * O ÍNDICE `uq_atendimento_aberto_por_cliente` PERMITE UM SÓ.
     *
     * A cliente voltou a falar depois do fechamento, então já existe episódio
     * novo aberto. Reabrir o antigo violaria o índice — e o erro chegaria como
     * 500 com stack do Postgres em vez de uma frase.
     */
    it('recusa quando a cliente já tem outro atendimento em curso', async () => {
      repo.buscarPorId.mockResolvedValue({
        id: 'at-antigo',
        clienteId: 'cli-1',
        fechadoEm: new Date(),
        desfecho: 'INATIVIDADE',
      });
      repo.buscarAbertoPorCliente.mockResolvedValue({ id: 'at-novo' });
      const uc = new ReabrirAtendimentoUseCase(repo as never);

      await expect(uc.execute('at-antigo')).rejects.toThrow(BadRequestException);
      expect(repo.reabrir).not.toHaveBeenCalled();
    });
  });
});
