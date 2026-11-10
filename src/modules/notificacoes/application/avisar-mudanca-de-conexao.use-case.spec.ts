import { AvisarMudancaDeConexaoUseCase } from './avisar-mudanca-de-conexao.use-case';

/**
 * ==========================================================================
 * QUEM FALA E QUEM CALA — 10/11/2026.
 *
 * O caso real: os chips da loja nao tem aparelho e deslogam a cada quatorze
 * dias. Na ultima vez ficou TRES DIAS caido, porque a agente simplesmente
 * fica quieta e ninguem de fora percebe.
 *
 * A regra do Lucas e de uma linha: *"se houver mudancas, notifica"*. Nao ha
 * curadoria de quem e importante — a conexao que esta parada ha treze dias
 * fica quieta por estar parada, nao por estar numa lista.
 * ==========================================================================
 */

interface Enviado {
  nivel: string;
  titulo: string;
  linhas: string[];
}

const enviados: Enviado[] = [];

const telegram = {
  enviar: async (nivel: string, titulo: string, linhas: string[]) => {
    enviados.push({ nivel, titulo, linhas });
    return true;
  },
} as never;

const conexoes = (rotulo: string | null) =>
  ({ rotuloDaSessao: async () => rotulo }) as never;

const EM = new Date('2026-11-10T17:34:00-03:00');

beforeEach(() => {
  enviados.length = 0;
});

describe('AvisarMudancaDeConexaoUseCase', () => {
  it('FAILED vira aviso vermelho com o rotulo', async () => {
    await new AvisarMudancaDeConexaoUseCase(
      conexoes('Anastasia (gestão)'),
      telegram,
    ).executar({ sessao: 'default', status: 'FAILED', numero: null, em: EM });

    expect(enviados).toHaveLength(1);
    expect(enviados[0].nivel).toBe('ruim');
    expect(enviados[0].titulo).toBe('Anastasia (gestão) caiu');
    expect(enviados[0].linhas[0]).toBe('Estado: FAILED · 10/11 17:34');
  });

  it('WORKING leva o numero; os outros estados nao', async () => {
    const uc = new AvisarMudancaDeConexaoUseCase(
      conexoes('Helena (vendedoras e catálogo)'),
      telegram,
    );
    await uc.executar({
      sessao: 'elena',
      status: 'WORKING',
      numero: '5585920110403@c.us',
      em: EM,
    });

    expect(enviados[0].nivel).toBe('bom');
    expect(enviados[0].titulo).toBe(
      'Helena (vendedoras e catálogo) reconectada',
    );
    expect(enviados[0].linhas[0]).toContain('5585920110403');
    expect(enviados[0].linhas[0]).not.toContain('@c.us');
  });

  it('STARTING nao envia nada', async () => {
    await new AvisarMudancaDeConexaoUseCase(conexoes('x'), telegram).executar({
      sessao: 'default',
      status: 'STARTING',
      numero: null,
      em: EM,
    });

    expect(enviados).toHaveLength(0);
  });

  it('sessao que nao e nossa nao envia nada', async () => {
    await new AvisarMudancaDeConexaoUseCase(conexoes(null), telegram).executar({
      sessao: 'teste-criado-na-mao',
      status: 'FAILED',
      numero: null,
      em: EM,
    });

    expect(enviados).toHaveLength(0);
  });

  it('o MESMO status repetido na janela nao envia de novo', async () => {
    const uc = new AvisarMudancaDeConexaoUseCase(
      conexoes('Anastasia (gestão)'),
      telegram,
    );
    await uc.executar({ sessao: 'default', status: 'FAILED', numero: null, em: EM });
    await uc.executar({
      sessao: 'default',
      status: 'FAILED',
      numero: null,
      em: new Date(EM.getTime() + 60_000),
    });

    expect(enviados).toHaveLength(1);
  });

  /**
   * A TRAVA DA TRAVA.
   *
   * A regra anti-oscilacao so pode engolir o MESMO estado. Se engolisse
   * estados diferentes, mataria justamente o par que o Lucas mais quer:
   * na medicao de 10/11, `SCAN_QR_CODE` chegou UM SEGUNDO depois do
   * `STARTING`, e o `WORKING` vem logo atras.
   */
  it('SCAN_QR_CODE seguido de WORKING manda os dois', async () => {
    const uc = new AvisarMudancaDeConexaoUseCase(
      conexoes('Anastasia (gestão)'),
      telegram,
    );
    await uc.executar({
      sessao: 'default',
      status: 'SCAN_QR_CODE',
      numero: null,
      em: EM,
    });
    await uc.executar({
      sessao: 'default',
      status: 'WORKING',
      numero: '55@c.us',
      em: new Date(EM.getTime() + 8_000),
    });

    expect(enviados.map((e) => e.nivel)).toEqual(['atencao', 'bom']);
  });

  it('sessoes diferentes nao se travam', async () => {
    const uc = new AvisarMudancaDeConexaoUseCase(
      conexoes('Anastasia (gestão)'),
      telegram,
    );
    await uc.executar({ sessao: 'default', status: 'FAILED', numero: null, em: EM });
    await uc.executar({ sessao: 'elena', status: 'FAILED', numero: null, em: EM });

    expect(enviados).toHaveLength(2);
  });

  it('passada a janela, o mesmo status volta a avisar', async () => {
    const uc = new AvisarMudancaDeConexaoUseCase(
      conexoes('Anastasia (gestão)'),
      telegram,
    );
    await uc.executar({ sessao: 'default', status: 'FAILED', numero: null, em: EM });
    await uc.executar({
      sessao: 'default',
      status: 'FAILED',
      numero: null,
      em: new Date(EM.getTime() + 6 * 60_000),
    });

    expect(enviados).toHaveLength(2);
  });

  it('estado desconhecido do WAHA nao passa calado', async () => {
    await new AvisarMudancaDeConexaoUseCase(
      conexoes('Anastasia (gestão)'),
      telegram,
    ).executar({ sessao: 'default', status: 'UNKNOWN', numero: null, em: EM });

    expect(enviados).toHaveLength(1);
    expect(enviados[0].nivel).toBe('neutro');
  });
});
