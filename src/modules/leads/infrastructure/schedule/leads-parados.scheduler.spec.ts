import { LeadsParadosScheduler } from './leads-parados.scheduler';
import { DIAS_ATE_PARADO } from '../../domain/entities/estado-lead';

/**
 * A VARREDURA DO LEAD QUE ESFRIOU — ANA-03, 29/09/2026.
 *
 * ==========================================================================
 * O QUE ESTES TESTES PROTEGEM E O PRAZO, E NAO O SQL.
 *
 * Prazo errado nao quebra nada: marca leads a mais ou a menos, e a gestao
 * recebe um funil plausivel e falso. Sete dias e decisao do Lucas em 29/09.
 * ==========================================================================
 */
describe('a varredura de leads parados', () => {
  const AGORA = new Date(2026, 8, 29, 14, 0, 0);
  let leads: { marcarParados: jest.Mock };
  let scheduler: LeadsParadosScheduler;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(AGORA);
    leads = { marcarParados: jest.fn().mockResolvedValue(0) };
    scheduler = new LeadsParadosScheduler(leads as never);
  });

  afterEach(() => jest.useRealTimers());

  it('o corte é exatamente 7 dias atrás', async () => {
    await scheduler.varrer();

    const limite = leads.marcarParados.mock.calls[0][0] as Date;
    const esperado = new Date(AGORA);
    esperado.setDate(esperado.getDate() - DIAS_ATE_PARADO);
    expect(limite).toEqual(esperado);
  });

  it('o prazo é o que o Lucas decidiu, e não um número solto', () => {
    expect(DIAS_ATE_PARADO).toBe(7);
  });

  /*
   * REENTRANCIA. O `@Cron` do Nest nao espera a rodada anterior terminar, e
   * duas varreduras concorrentes na mesma tabela, com o banco lento, e
   * disputa gratuita.
   */
  it('não roda duas ao mesmo tempo', async () => {
    let liberar!: () => void;
    leads.marcarParados.mockReturnValue(new Promise<number>((r) => { liberar = () => r(0); }));

    const primeira = scheduler.varrer();
    await scheduler.varrer(); // esta deve desistir

    expect(leads.marcarParados).toHaveBeenCalledTimes(1);
    liberar();
    await primeira;
  });

  it('depois que a anterior termina, a próxima roda', async () => {
    await scheduler.varrer();
    await scheduler.varrer();
    expect(leads.marcarParados).toHaveBeenCalledTimes(2);
  });

  /* Falha de banco nao pode derrubar o processo: o cron seguinte tenta de novo,
   * e o dado nao se perde — o lead continua elegivel. */
  it('falha no banco não derruba a rodada nem trava a próxima', async () => {
    leads.marcarParados.mockRejectedValueOnce(new Error('conexão caiu'));

    await expect(scheduler.varrer()).resolves.toBeUndefined();

    leads.marcarParados.mockResolvedValue(3);
    await scheduler.varrer();
    expect(leads.marcarParados).toHaveBeenCalledTimes(2);
  });
});
