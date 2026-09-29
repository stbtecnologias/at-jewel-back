import type { ConfigService } from '@nestjs/config';
import {
  LimiteDeEnvioExcedido,
  LimiteDeEnvioService,
} from './limite-de-envio.service';

/**
 * O TETO DE ENVIO — requisito RF-12.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE: A CONTA NAO ABRE POR ACIDENTE NOSSO.
 *
 * O documento de requisitos e explicito sobre o porque: contas de WhatsApp
 * foram bloqueadas DEFINITIVAMENTE por envio em volume, com perda dos contatos
 * e das conversas. O que impede disparo em massa e nao existir caminho para
 * ele (RF-11); este limite e a rede embaixo, contra laco e fila represada.
 *
 * O TEMPO ENTRA POR PARAMETRO em vez de `jest.useFakeTimers`: a janela e a
 * regra inteira deste servico, e testa-la com relogio de mentira esconderia
 * justamente o erro de quem confunde "60 minutos" com "60 segundos".
 * ==========================================================================
 */
describe('LimiteDeEnvioService', () => {
  const configCom = (valores: Record<string, string>): ConfigService =>
    ({ get: (k: string) => valores[k] }) as unknown as ConfigService;

  const HORA = 3_600_000;
  const T0 = 1_700_000_000_000;

  describe('teto por destino', () => {
    it('deixa passar ate o limite e bloqueia o seguinte', () => {
      const s = new LimiteDeEnvioService(
        configCom({ WHATSAPP_LIMITE_POR_DESTINO: '3' }),
      );

      for (let i = 0; i < 3; i++) s.registrar('5585@c.us', 'default', T0 + i);

      expect(() => s.registrar('5585@c.us', 'default', T0 + 3)).toThrow(
        LimiteDeEnvioExcedido,
      );
    });

    it('OUTRO destino nao e afetado — o laco de um nao cala a equipe', () => {
      const s = new LimiteDeEnvioService(
        configCom({ WHATSAPP_LIMITE_POR_DESTINO: '2' }),
      );

      s.registrar('5585@c.us', 'default', T0);
      s.registrar('5585@c.us', 'default', T0);

      expect(() => s.registrar('5511@c.us', 'default', T0)).not.toThrow();
    });

    it('passada a janela, volta a enviar', () => {
      const s = new LimiteDeEnvioService(
        configCom({ WHATSAPP_LIMITE_POR_DESTINO: '2' }),
      );

      s.registrar('5585@c.us', 'default', T0);
      s.registrar('5585@c.us', 'default', T0);
      expect(() => s.registrar('5585@c.us', 'default', T0)).toThrow();

      // Uma hora e um milissegundo depois: os dois primeiros sairam da janela.
      expect(() =>
        s.registrar('5585@c.us', 'default', T0 + HORA + 1),
      ).not.toThrow();
    });

    it('A TENTATIVA RECUSADA NAO CONTA', () => {
      // Se a recusa entrasse na janela, um laco travado empurraria a janela
      // para a frente sozinho e o numero nunca voltaria a enviar — o bloqueio
      // viraria permanente sem ninguem ter pedido isso.
      const s = new LimiteDeEnvioService(
        configCom({ WHATSAPP_LIMITE_POR_DESTINO: '1' }),
      );

      s.registrar('5585@c.us', 'default', T0);
      for (let i = 1; i <= 50; i++) {
        expect(() => s.registrar('5585@c.us', 'default', T0 + i)).toThrow();
      }

      // O unico envio real foi em T0. Passada a janela a partir DELE, libera.
      expect(() =>
        s.registrar('5585@c.us', 'default', T0 + HORA + 1),
      ).not.toThrow();
    });
  });

  describe('teto por numero da casa', () => {
    it('bloqueia mesmo com os destinos todos diferentes', () => {
      // O acidente que este teto pega e a fila represada despejando para
      // MUITA gente — nenhum destino sozinho estouraria o outro limite.
      const s = new LimiteDeEnvioService(
        configCom({
          WHATSAPP_LIMITE_POR_NUMERO: '3',
          WHATSAPP_LIMITE_POR_DESTINO: '99',
        }),
      );

      s.registrar('a@c.us', 'default', T0);
      s.registrar('b@c.us', 'default', T0);
      s.registrar('c@c.us', 'default', T0);

      expect(() => s.registrar('d@c.us', 'default', T0)).toThrow(
        LimiteDeEnvioExcedido,
      );
    });

    it('os dois chips contam separado', () => {
      // Helena e Anastasia sao numeros diferentes na Meta: o volume de um nao
      // e problema do outro.
      const s = new LimiteDeEnvioService(
        configCom({ WHATSAPP_LIMITE_POR_NUMERO: '2' }),
      );

      s.registrar('a@c.us', 'default', T0);
      s.registrar('b@c.us', 'default', T0);
      expect(() => s.registrar('c@c.us', 'default', T0)).toThrow();

      expect(() => s.registrar('a@c.us', 'elena', T0)).not.toThrow();
    });
  });

  describe('configuracao ausente ou torta', () => {
    it('sem `.env`, usa os padroes e NAO bloqueia conversa normal', () => {
      const s = new LimiteDeEnvioService(configCom({}));

      // Trinta mensagens para a mesma pessoa numa hora ja e muito acima de
      // qualquer conversa real — mas o padrao tem de aguentar isso sem travar.
      for (let i = 0; i < 29; i++) {
        expect(() => s.registrar('5585@c.us', 'default', T0 + i)).not.toThrow();
      }
    });

    it('valor invalido vira o padrao, e NAO zero', () => {
      // `Number('')` e 0 e `Number('abc')` e NaN. Os dois viram teto zero numa
      // leitura ingenua — e teto zero bloqueia TODA mensagem, deixando o canal
      // mudo por causa de um `.env` mal digitado.
      for (const valor of ['', 'abc', '0', '-5']) {
        const s = new LimiteDeEnvioService(
          configCom({ WHATSAPP_LIMITE_POR_DESTINO: valor }),
        );
        expect(() => s.registrar('5585@c.us', 'default', T0)).not.toThrow();
      }
    });

    it('a janela e configuravel em MINUTOS', () => {
      const s = new LimiteDeEnvioService(
        configCom({
          WHATSAPP_LIMITE_POR_DESTINO: '1',
          WHATSAPP_JANELA_MINUTOS: '5',
        }),
      );

      s.registrar('5585@c.us', 'default', T0);
      // 4 minutos: ainda dentro.
      expect(() => s.registrar('5585@c.us', 'default', T0 + 240_000)).toThrow();
      // 5 minutos e 1ms: fora.
      expect(() =>
        s.registrar('5585@c.us', 'default', T0 + 300_001),
      ).not.toThrow();
    });
  });

  it('o erro e de TIPO proprio — quem chama distingue de falha do WAHA', () => {
    const s = new LimiteDeEnvioService(
      configCom({ WHATSAPP_LIMITE_POR_DESTINO: '1' }),
    );
    s.registrar('5585@c.us', 'default', T0);

    try {
      s.registrar('5585@c.us', 'default', T0);
      throw new Error('deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(LimiteDeEnvioExcedido);
      // Sem o destino na mensagem: chatId e telefone, e telefone e PII.
      expect((err as Error).message).not.toContain('5585');
    }
  });

  it('`limpar` destrava sem precisar de restart', () => {
    const s = new LimiteDeEnvioService(
      configCom({ WHATSAPP_LIMITE_POR_DESTINO: '1' }),
    );

    s.registrar('5585@c.us', 'default', T0);
    expect(() => s.registrar('5585@c.us', 'default', T0)).toThrow();

    s.limpar();
    expect(() => s.registrar('5585@c.us', 'default', T0)).not.toThrow();
  });
});
