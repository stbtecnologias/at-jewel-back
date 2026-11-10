import { Logger } from '@nestjs/common';
import type {
  Aviso,
  NivelDoAviso,
} from '../infrastructure/telegram/telegram.client';
import { AvisarMudancaDeConexaoUseCase } from './avisar-mudanca-de-conexao.use-case';

/**
 * ==========================================================================
 * QUEM FALA E QUEM CALA — 10/11/2026.
 *
 * O caso real: os chips da loja nao tem aparelho e deslogam a cada quatorze
 * dias. Na ultima vez ficou TRES DIAS caido, porque a agente simplesmente
 * fica quieta e ninguem de fora percebe.
 *
 * A regra do Lucas e de uma linha: "se houver mudancas, notifica". Nao ha
 * curadoria de quem e importante — a conexao parada ha treze dias fica quieta
 * por estar parada, e nao por estar fora de uma lista.
 * ==========================================================================
 */

const enviados: Array<{ nivel: NivelDoAviso; aviso: Aviso }> = [];

const telegram = {
  enviar: async (nivel: NivelDoAviso, aviso: Aviso) => {
    enviados.push({ nivel, aviso });
    return true;
  },
} as never;

const casa = {
  identidadeDaSessao: async (sessao: string) => ({
    nome: 'Anastasia',
    funcao: 'gestão',
    sessao,
    orfa: false,
  }),
} as never;

const conexoes = (identidade: unknown) =>
  ({ identidadeDaSessao: async () => identidade }) as never;

const EM = new Date('2026-11-10T16:02:00-03:00');
const bloco = () => enviados[0].aviso.bloco ?? [];

beforeEach(() => {
  enviados.length = 0;
});

describe('AvisarMudancaDeConexaoUseCase', () => {
  it('FAILED: titulo curto, funcao embaixo, estado no bloco, recado no fim', async () => {
    await new AvisarMudancaDeConexaoUseCase(casa, telegram).executar({
      sessao: 'default',
      status: 'FAILED',
      numero: null,
      em: EM,
    });

    expect(enviados).toHaveLength(1);
    expect(enviados[0].nivel).toBe('ruim');
    expect(enviados[0].aviso.titulo).toBe('Anastasia caiu');
    expect(enviados[0].aviso.subtitulo).toBe('gestão');
    expect(enviados[0].aviso.etiquetas).toEqual(['falha']);
    expect(bloco()).toEqual([
      { rotulo: 'Estado', valor: 'FAILED' },
      { rotulo: 'Desde 16:02' },
    ]);
    expect(enviados[0].aviso.recado).toBe('Precisa reconectar pelo painel.');
    expect(enviados[0].aviso.silencioso).toBeFalsy();
  });

  /**
   * O QR NAO DIZ QUANDO EXPIRA, E A GENTE NAO INVENTA.
   *
   * O `session.status` nao traz validade nenhuma, e o WhatsApp renova o
   * codigo sozinho sem mudar de estado. Um horario exato teria cara de dado e
   * seria chute — e na primeira vez que escanear depois dele e funcionar, o
   * aviso perde a credibilidade. "Pedido as" e a hora do evento: e verdade, e
   * orienta igual.
   */
  it('SCAN_QR_CODE diz quando foi PEDIDO, nunca quando expira', async () => {
    await new AvisarMudancaDeConexaoUseCase(casa, telegram).executar({
      sessao: 'default',
      status: 'SCAN_QR_CODE',
      numero: null,
      em: EM,
    });

    expect(enviados[0].nivel).toBe('atencao');
    expect(enviados[0].aviso.titulo).toBe('Anastasia aguardando QR');
    expect(bloco()).toEqual([
      { rotulo: 'Estado', valor: 'SCAN_QR_CODE' },
      { rotulo: 'Pedido às 16:02' },
    ]);
    expect(JSON.stringify(enviados[0].aviso)).not.toContain('Expira');
  });

  it('WORKING: numero formatado, sem som, e tempo fora do ar quando se sabe', async () => {
    const uc = new AvisarMudancaDeConexaoUseCase(casa, telegram);
    await uc.executar({
      sessao: 'default',
      status: 'FAILED',
      numero: null,
      em: EM,
    });
    enviados.length = 0;

    await uc.executar({
      sessao: 'default',
      status: 'WORKING',
      numero: '5585920110403@c.us',
      em: new Date(EM.getTime() + 4 * 60_000),
    });

    expect(enviados[0].nivel).toBe('bom');
    expect(enviados[0].aviso.titulo).toBe('Anastasia reconectada');
    expect(enviados[0].aviso.silencioso).toBe(true);
    expect(bloco()).toEqual([
      { rotulo: 'Número', valor: '+55 85 92011-0403' },
      { rotulo: 'Fora do ar: 4 min (16:02 → 16:06)' },
    ]);
  });

  /** Depois de um build a hora da queda se perde: melhor omitir que mentir. */
  it('WORKING sem queda conhecida nao inventa tempo fora do ar', async () => {
    await new AvisarMudancaDeConexaoUseCase(casa, telegram).executar({
      sessao: 'default',
      status: 'WORKING',
      numero: '5585920110403@c.us',
      em: EM,
    });

    expect(bloco()).toEqual([{ rotulo: 'Número', valor: '+55 85 92011-0403' }]);
  });

  it('STOPPED e silencioso: desconectar costuma ser alguem clicando', async () => {
    await new AvisarMudancaDeConexaoUseCase(casa, telegram).executar({
      sessao: 'default',
      status: 'STOPPED',
      numero: null,
      em: EM,
    });

    expect(enviados[0].aviso.silencioso).toBe(true);
    expect(enviados[0].aviso.etiquetas).toEqual(['off']);
  });

  it('STARTING nao envia nada', async () => {
    await new AvisarMudancaDeConexaoUseCase(casa, telegram).executar({
      sessao: 'default',
      status: 'STARTING',
      numero: null,
      em: EM,
    });

    expect(enviados).toHaveLength(0);
  });

  it('estado desconhecido do WAHA nao passa calado', async () => {
    await new AvisarMudancaDeConexaoUseCase(casa, telegram).executar({
      sessao: 'default',
      status: 'UNKNOWN',
      numero: null,
      em: EM,
    });

    expect(enviados).toHaveLength(1);
    expect(enviados[0].nivel).toBe('neutro');
  });

  /**
   * A ORFA NAO NOMEIA NINGUEM: com dois orfaos, dois avisos identicos — e so
   * a tela de Conexoes diria qual e qual, que e a conferencia manual que esta
   * funcionalidade existe para tirar.
   */
  it('a orfa leva o nome da sessao no bloco', async () => {
    const sessao = 'vend-9ef62011-af97-4bde-83d8-a63142b45c73';
    await new AvisarMudancaDeConexaoUseCase(
      conexoes({
        nome: 'Vendedora desligada',
        funcao: 'conexão ainda ativa',
        sessao,
        orfa: true,
      }),
      telegram,
    ).executar({ sessao, status: 'FAILED', numero: null, em: EM });

    expect(bloco()).toContainEqual({ rotulo: 'Sessão', valor: sessao });
  });

  it('quem tem nome proprio NAO ganha a linha da sessao', async () => {
    await new AvisarMudancaDeConexaoUseCase(casa, telegram).executar({
      sessao: 'default',
      status: 'FAILED',
      numero: null,
      em: EM,
    });

    expect(JSON.stringify(bloco())).not.toContain('Sessão');
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

  /**
   * SILENCIO E O SINAL DE "ESTA TUDO BEM" DESTE SISTEMA.
   *
   * Em producao o nivel de log e `info`, entao o `debug` da sessao ignorada
   * NAO EXISTE la. Se `WAHA_SESSION_ELENA` estiver errada ou faltando, todo
   * evento da Helena cai no `null` da lista de permissao e e descartado sem
   * deixar rastro — e o canal parece saudavel porque as outras sessoes seguem
   * avisando. Um `warn`, UMA vez por nome, torna isso visivel sem enxurrada.
   */
  it('sessao desconhecida vira aviso no log UMA vez, nao a cada evento', async () => {
    const avisos: string[] = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });

    const uc = new AvisarMudancaDeConexaoUseCase(conexoes(null), telegram);
    await uc.executar({
      sessao: 'teste-na-mao',
      status: 'FAILED',
      numero: null,
      em: EM,
    });
    await uc.executar({
      sessao: 'teste-na-mao',
      status: 'WORKING',
      numero: null,
      em: EM,
    });
    await uc.executar({
      sessao: 'outra-na-mao',
      status: 'FAILED',
      numero: null,
      em: EM,
    });

    expect(avisos.filter((a) => a.includes('teste-na-mao'))).toHaveLength(1);
    expect(avisos.filter((a) => a.includes('outra-na-mao'))).toHaveLength(1);
    expect(enviados).toHaveLength(0);

    jest.restoreAllMocks();
  });

  describe('a trava anti-enxurrada', () => {
    it('o MESMO status repetido na janela nao envia de novo', async () => {
      const uc = new AvisarMudancaDeConexaoUseCase(casa, telegram);
      await uc.executar({
        sessao: 'default',
        status: 'FAILED',
        numero: null,
        em: EM,
      });
      await uc.executar({
        sessao: 'default',
        status: 'FAILED',
        numero: null,
        em: new Date(EM.getTime() + 60_000),
      });

      expect(enviados).toHaveLength(1);
    });

    /**
     * A TRAVA DA TRAVA. Se engolisse estados diferentes, mataria o par que o
     * Lucas mais quer: na medicao de 10/11 o `SCAN_QR_CODE` chegou um segundo
     * depois do `STARTING`, e o `WORKING` vem logo atras.
     */
    it('SCAN_QR_CODE seguido de WORKING manda os dois', async () => {
      const uc = new AvisarMudancaDeConexaoUseCase(casa, telegram);
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
      const uc = new AvisarMudancaDeConexaoUseCase(casa, telegram);
      await uc.executar({
        sessao: 'default',
        status: 'FAILED',
        numero: null,
        em: EM,
      });
      await uc.executar({
        sessao: 'elena',
        status: 'FAILED',
        numero: null,
        em: EM,
      });

      expect(enviados).toHaveLength(2);
    });

    it('passada a janela, o mesmo status volta a avisar', async () => {
      const uc = new AvisarMudancaDeConexaoUseCase(casa, telegram);
      await uc.executar({
        sessao: 'default',
        status: 'FAILED',
        numero: null,
        em: EM,
      });
      await uc.executar({
        sessao: 'default',
        status: 'FAILED',
        numero: null,
        em: new Date(EM.getTime() + 6 * 60_000),
      });

      expect(enviados).toHaveLength(2);
    });
  });
});
