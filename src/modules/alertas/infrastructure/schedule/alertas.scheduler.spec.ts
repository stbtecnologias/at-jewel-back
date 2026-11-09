import { AlertasScheduler } from './alertas.scheduler';

/**
 * ==========================================================================
 * QUEM RECEBE ALERTA — e quem para de receber, desde a migracao 77.
 *
 * Este agendador e o unico do sistema que fala com gente sozinho: manda
 * mensagem no WhatsApp de alguem sem a pessoa ter pedido. Por isso continuar
 * mandando para quem saiu da casa e o pior tipo de vazamento — ninguem repara
 * que esta acontecendo, porque nao ha ninguem do lado de ca esperando
 * resposta.
 *
 * O arquivo nasceu em 09/11/2026 com este unico assunto. O resto do
 * agendador — o interruptor `ALERTAS_ATIVOS`, o ensaio, a trava de varredura
 * concorrente — continua sem spec, e isso esta dito aqui de proposito para
 * nao parecer coberto.
 * ==========================================================================
 */
describe('AlertasScheduler — os destinatários', () => {
  const DENTRO = { id: 'a1', telefone: '5585911111111', role: 'ADMIN', ativo: true };
  const FORA = { id: 'a2', telefone: '5585922222222', role: 'ADMIN', ativo: false };
  const SEM_FONE = { id: 'a3', telefone: null, role: 'ADMIN', ativo: true };

  function montar(todos: unknown[]) {
    const varrer = {
      execute: jest
        .fn()
        .mockResolvedValue({ enviados: 0, repetidos: 0, falhas: 0, ignoradas: [] }),
    };
    const scheduler = new AlertasScheduler(
      varrer as never,
      { listarTodos: jest.fn().mockResolvedValue(todos) } as never,
      { possui: jest.fn().mockResolvedValue(true) } as never,
      { enviarTexto: jest.fn() } as never,
      { get: () => 'false' } as never,
    );
    return { scheduler, varrer };
  }

  /* ESTE É O TESTE. */
  it('o desativado NÃO está na lista de quem recebe', async () => {
    const { scheduler, varrer } = montar([DENTRO, FORA]);

    await scheduler.rodar();

    expect(varrer.execute).toHaveBeenCalledWith(
      expect.any(Function),
      ['5585911111111'],
    );
  });

  it('e quem está na casa continua recebendo', async () => {
    const { scheduler, varrer } = montar([DENTRO]);

    await scheduler.rodar();

    expect(varrer.execute.mock.calls[0][1]).toEqual(['5585911111111']);
  });

  it('sem telefone cadastrado também fica de fora — o critério antigo não mudou', async () => {
    const { scheduler, varrer } = montar([DENTRO, SEM_FONE]);

    await scheduler.rodar();

    expect(varrer.execute.mock.calls[0][1]).toEqual(['5585911111111']);
  });
});
