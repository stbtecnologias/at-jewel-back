import { Logger } from '@nestjs/common';
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

  /**
   * A ORFA PRECISA DIZER QUAL E — achado da revisao de 10/11.
   *
   * O rotulo da orfa nao nomeia ninguem: "Vendedora desligada — conexao ainda
   * ativa". Com dois orfaos no WAHA, os dois avisos sairiam identicos, e o
   * Lucas teria de abrir a tela de Conexoes para descobrir qual — que e
   * exatamente a conferencia manual que esta funcionalidade existe para tirar.
   */
  it('a orfa leva o nome da sessao, senao o aviso nao diz qual e', async () => {
    await new AvisarMudancaDeConexaoUseCase(
      conexoes('Vendedora desligada — conexão ainda ativa'),
      telegram,
    ).executar({
      sessao: 'vend-9ef62011-af97-4bde-83d8-a63142b45c73',
      status: 'FAILED',
      numero: null,
      em: EM,
    });

    expect(enviados[0].linhas).toContain(
      'Sessão: vend-9ef62011-af97-4bde-83d8-a63142b45c73',
    );
  });

  it('quem tem nome proprio NAO ganha a linha da sessao', async () => {
    await new AvisarMudancaDeConexaoUseCase(
      conexoes('Anastasia (gestão)'),
      telegram,
    ).executar({ sessao: 'default', status: 'FAILED', numero: null, em: EM });

    expect(enviados[0].linhas.join(' ')).not.toContain('Sessão:');
  });

  /**
   * SILENCIO E O SINAL DE "ESTA TUDO BEM" DESTE SISTEMA — revisao de 10/11.
   *
   * Em producao o nivel de log e `info`, entao o `debug` da sessao ignorada
   * NAO EXISTE la. Se `WAHA_SESSION_ELENA` estiver errada ou faltando, todo
   * evento da Helena cai no `null` da lista de permissao e e descartado sem
   * deixar rastro — e o canal parece saudavel porque as outras sessoes
   * seguem avisando. Um `warn`, UMA vez por nome, e o que torna isso visivel
   * sem virar enxurrada.
   */
  it('sessao desconhecida vira aviso no log UMA vez, nao a cada evento', async () => {
    const avisos: string[] = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });

    const uc = new AvisarMudancaDeConexaoUseCase(conexoes(null), telegram);
    await uc.executar({ sessao: 'teste-na-mao', status: 'FAILED', numero: null, em: EM });
    await uc.executar({ sessao: 'teste-na-mao', status: 'WORKING', numero: null, em: EM });
    await uc.executar({ sessao: 'outra-na-mao', status: 'FAILED', numero: null, em: EM });

    expect(avisos.filter((a) => a.includes('teste-na-mao'))).toHaveLength(1);
    expect(avisos.filter((a) => a.includes('outra-na-mao'))).toHaveLength(1);
    expect(enviados).toHaveLength(0);

    jest.restoreAllMocks();
  });
});
