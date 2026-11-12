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

  /**
   * QUEM NUNCA SUBIU NAO CAIU — achado do Lucas em 10/11, no local.
   *
   * Ele conectou a ALINE pela PRIMEIRA vez e recebeu "Fora do ar: 8 min".
   * Os oito minutos eram um teste meu, que criou e apagou a sessao dela as
   * 17:05 — o back dele estava escutando o mesmo WAHA, viu o `SCAN_QR_CODE` e
   * o `STOPPED`, e guardou aquilo como hora da queda.
   *
   * O erro de fundo: eu tratava QUALQUER estado diferente de `WORKING` como
   * queda. `SCAN_QR_CODE` quer dizer o contrario — a sessao NAO esta
   * autenticada, e pode nunca ter estado.
   */
  it('quem nunca esteve no ar nao ganha tempo fora do ar', async () => {
    const uc = new AvisarMudancaDeConexaoUseCase(casa, telegram);
    await uc.executar({
      sessao: 'default',
      status: 'SCAN_QR_CODE',
      numero: null,
      em: EM,
    });
    await uc.executar({
      sessao: 'default',
      status: 'STOPPED',
      numero: null,
      em: new Date(EM.getTime() + 60_000),
    });
    enviados.length = 0;

    await uc.executar({
      sessao: 'default',
      status: 'WORKING',
      numero: '5585920110403@c.us',
      em: new Date(EM.getTime() + 8 * 60_000),
    });

    expect(bloco()).toEqual([{ rotulo: 'Número', valor: '+55 85 92011-0403' }]);
  });

  /** Mas quem ESTAVA no ar e parou, caiu — e o tempo e verdadeiro. */
  it('sessao que estava no ar e foi parada conta o tempo fora', async () => {
    const uc = new AvisarMudancaDeConexaoUseCase(casa, telegram);
    await uc.executar({
      sessao: 'default',
      status: 'WORKING',
      numero: '55@c.us',
      em: EM,
    });
    await uc.executar({
      sessao: 'default',
      status: 'STOPPED',
      numero: null,
      em: new Date(EM.getTime() + 60_000),
    });
    enviados.length = 0;

    await uc.executar({
      sessao: 'default',
      status: 'WORKING',
      numero: '5585920110403@c.us',
      em: new Date(EM.getTime() + 4 * 60_000),
    });

    expect(JSON.stringify(bloco())).toContain('Fora do ar: 3 min');
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
  /**
   * ========================================================================
   * A HISTORIA QUE O WAHA MANDA — 11/11/2026.
   *
   * O caso: o Lucas recebeu cinco "reconectada" seguidos, de sessoes que
   * NUNCA cairam. Capturei o evento da KEYCIANE as 16:45 escutando o /ws de
   * producao, e o payload contava a historia inteira:
   *
   *     08:00:57  STARTING
   *     08:00:58  WORKING    (+0,691s)
   *     16:45:07  STARTING            <- 8,7 h depois
   *     16:45:08  WORKING    (+0,216s)
   *
   * O motor do WAHA refez a sessao sozinho, com a credencial guardada, em
   * 216 MILESIMOS. Ninguem ficou sem atendimento. Nao e noticia.
   *
   * O campo "statuses" do payload — que a gente recebia e jogava fora — e
   * quem separa os dois casos, E E MELHOR QUE A NOSSA MEMORIA: ele sobrevive
   * ao reinicio do back, que apaga os mapas daqui.
   * ========================================================================
   */
  describe('a historia do WAHA', () => {
    const marco = (status: string, em: Date) => ({ status, em });

    it('o motor que se curou sozinho nao vira aviso', async () => {
      await new AvisarMudancaDeConexaoUseCase(casa, telegram).executar({
        sessao: 'default',
        status: 'WORKING',
        numero: '5585920110403@c.us',
        em: new Date(EM.getTime() + 216),
        historia: [
          marco('WORKING', new Date(EM.getTime() - 8.7 * 3_600_000)),
          marco('STARTING', EM),
          marco('WORKING', new Date(EM.getTime() + 216)),
        ],
      });

      expect(enviados).toHaveLength(0);
    });

    /** Piscada curta e ruido; parada longa e queda, mesmo vindo de STARTING. */
    it('STARTING que demora nao e piscada: e queda com tempo de verdade', async () => {
      await new AvisarMudancaDeConexaoUseCase(casa, telegram).executar({
        sessao: 'default',
        status: 'WORKING',
        numero: '5585920110403@c.us',
        em: new Date(EM.getTime() + 10 * 60_000),
        historia: [
          marco('WORKING', new Date(EM.getTime() - 3_600_000)),
          marco('STARTING', EM),
          marco('WORKING', new Date(EM.getTime() + 10 * 60_000)),
        ],
      });

      expect(enviados).toHaveLength(1);
      expect(enviados[0].aviso.titulo).toBe('Anastasia reconectada');
      expect(JSON.stringify(bloco())).toContain('Fora do ar: 10 min');
    });

    /**
     * ESTE E O CONSERTO DA PALAVRA. Ate 11/11 todo WORKING dizia
     * "reconectada", mesmo quando o proprio codigo sabia que nao houve queda
     * — a linha "Fora do ar" nem aparecia nas cinco mensagens dele.
     */
    it('sem queda nenhuma a palavra e "conectada"', async () => {
      await new AvisarMudancaDeConexaoUseCase(casa, telegram).executar({
        sessao: 'default',
        status: 'WORKING',
        numero: '5585920110403@c.us',
        em: new Date(EM.getTime() + 2_000),
        historia: [
          marco('STARTING', new Date(EM.getTime() - 1_000)),
          marco('SCAN_QR_CODE', EM),
          marco('WORKING', new Date(EM.getTime() + 2_000)),
        ],
      });

      expect(enviados[0].aviso.titulo).toBe('Anastasia conectada');
      expect(bloco()).toEqual([
        { rotulo: 'Número', valor: '+55 85 92011-0403' },
      ]);
    });

    /**
     * A historia vale MESMO SEM MEMORIA — processo recem-subido, mapas
     * vazios. E o que conserta o tempo fora do ar depois de um deploy.
     */
    it('depois de FAILED a volta e verdadeira, sem o processo ter visto a queda', async () => {
      await new AvisarMudancaDeConexaoUseCase(casa, telegram).executar({
        sessao: 'default',
        status: 'WORKING',
        numero: '5585920110403@c.us',
        em: new Date(EM.getTime() + 2 * 3_600_000),
        historia: [
          marco('WORKING', new Date(EM.getTime() - 3_600_000)),
          marco('FAILED', EM),
          marco('WORKING', new Date(EM.getTime() + 2 * 3_600_000)),
        ],
      });

      expect(enviados[0].aviso.titulo).toBe('Anastasia reconectada');
      expect(JSON.stringify(bloco())).toContain('Fora do ar: 2 h');
    });

    /**
     * O EVENTO REAL, COMO VEIO DO /ws DE PRODUCAO as 16:45 de 11/11/2026.
     *
     * Carimbos copiados da captura, sem arredondar. Este teste existe para
     * que a proxima mudanca na regra tenha de passar pelo caso que originou
     * o conserto, e nao por uma versao idealizada dele.
     */
    it('o evento real da KEYCIANE nao vira mensagem nenhuma', async () => {
      await new AvisarMudancaDeConexaoUseCase(casa, telegram).executar({
        sessao: 'vend-9b0d8d87-1ecd-4eae-a0ad-dee716758007',
        status: 'WORKING',
        numero: '5585900000000@c.us',
        em: new Date(1794426308112),
        historia: [
          marco('WORKING', new Date(1794394858252)),
          marco('STARTING', new Date(1794426307896)),
          marco('WORKING', new Date(1794426308112)),
        ],
      });

      expect(enviados).toHaveLength(0);
    });

    /** Payload sem a historia (WAHA antigo) nao pode derrubar nada. */
    it('sem historia, vale a memoria do processo, como antes', async () => {
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

      expect(enviados[0].aviso.titulo).toBe('Anastasia reconectada');
      expect(JSON.stringify(bloco())).toContain('Fora do ar: 4 min');
    });
  });
});
