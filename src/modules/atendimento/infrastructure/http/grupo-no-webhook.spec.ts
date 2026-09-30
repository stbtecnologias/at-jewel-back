import {
  extrairMensagemRecebida,
  mencionadosDoEvento,
  semMencoes,
} from './waha-webhook';

/**
 * A ANASTASIA EM GRUPO — 30/09/2026.
 *
 * ==========================================================================
 * O PAYLOAD DAQUI FOI MEDIDO, E NAO ESCRITO DE MEMORIA.
 *
 * Sai de um grupo de verdade (`Teste IA Anastasia`), com duas mensagens: uma
 * sem mencao e uma com. A forma esta registrada em
 * `Planejamento/2026-09-30 — Anastasia em grupo da gestao.md`.
 *
 * O que estes testes guardam, acima de tudo, e a CHAVE DA MENCAO:
 * `mentionedJID`, com JID maiusculo. Toda documentacao publica escreve
 * `mentionedJid`, e essa forma nao existe no payload — escrever de cor
 * produziria o pior defeito possivel: a lista vem sempre vazia, a agente
 * nunca responde, e nao ha erro em lugar nenhum para explicar por que.
 * ==========================================================================
 */
describe('mensagem de grupo', () => {
  const MEU_LID = '158205808246878@lid';
  const GRUPO = '120363111111111111@g.us';

  const evento = (over: {
    texto?: string;
    mencionados?: string[];
    senderAlt?: string;
    fromMe?: boolean;
  } = {}) => ({
    event: 'message',
    session: 'default',
    payload: {
      from: GRUPO,
      fromMe: over.fromMe ?? false,
      body: over.texto ?? 'qual o faturamento da semana?',
      participant: '111111111111111@lid',
      timestamp: 1_759_000_000,
      _data: {
        Info: {
          IsGroup: true,
          Chat: GRUPO,
          Sender: '111111111111111:12@lid',
          SenderAlt: over.senderAlt ?? '5585988887777:15@s.whatsapp.net',
        },
        Message: over.mencionados
          ? {
              extendedTextMessage: {
                contextInfo: { mentionedJID: over.mencionados },
              },
            }
          : {},
      },
    },
  });

  describe('a leitura da menção', () => {
    it('lê `mentionedJID` — com JID MAIÚSCULO', () => {
      const p = evento({ mencionados: [MEU_LID] }).payload;

      expect(mencionadosDoEvento(p as never)).toEqual([MEU_LID]);
    });

    /*
     * A forma errada e a que todo exemplo publico ensina. Este teste existe
     * para que, se alguem "corrigir" a chave para `mentionedJid`, a suite
     * caia em vez de a agente emudecer em producao sem explicacao.
     */
    it('a grafia `mentionedJid` NÃO é lida — ela não existe no payload', () => {
      const p = {
        _data: {
          Message: {
            extendedTextMessage: { contextInfo: { mentionedJid: [MEU_LID] } },
          },
        },
      };

      expect(mencionadosDoEvento(p as never)).toEqual([]);
    });

    it('sem menção nenhuma, a lista é vazia — e não undefined', () => {
      expect(mencionadosDoEvento(evento().payload as never)).toEqual([]);
    });

    it('lixo no lugar da lista não derruba a borda', () => {
      const p = {
        _data: {
          Message: {
            extendedTextMessage: { contextInfo: { mentionedJID: 'nao-array' } },
          },
        },
      };

      expect(mencionadosDoEvento(p as never)).toEqual([]);
    });
  });

  describe('quem escreveu', () => {
    /*
     * Em grupo, `participant` e `Info.Sender` vem como `@lid` — sem telefone
     * nenhum. So o `SenderAlt` carrega o numero, e e por isso que ele e a
     * fonte: sem ele nao ha como reconhecer a pessoa.
     */
    it('sai do `SenderAlt`, e não do participant, que é @lid', () => {
      const msg = extrairMensagemRecebida(evento());

      expect(msg?.grupo?.autor).toBe('5585988887777@c.us');
    });

    it('o sufixo de aparelho (`:15`) fica de fora do telefone', () => {
      const msg = extrairMensagemRecebida(
        evento({ senderAlt: '5585988887777:3@s.whatsapp.net' }),
      );

      expect(msg?.grupo?.autor).toBe('5585988887777@c.us');
    });

    /* Sem saber quem falou nao ha reconhecimento — e sem reconhecimento a
     * mensagem seria descartada mais adiante, num lugar mais confuso. */
    it('sem `SenderAlt`, a mensagem não entra', () => {
      expect(
        extrairMensagemRecebida(evento({ senderAlt: '' })),
      ).toBeNull();
    });

    it('o chat continua sendo o GRUPO — é para lá que a resposta vai', () => {
      expect(extrairMensagemRecebida(evento())?.de).toBe(GRUPO);
    });
  });

  describe('a limpeza do texto', () => {
    /*
     * Os dois jeitos que o Lucas pediu em 29/09. A posicao nao importa porque
     * a DETECCAO le a lista, nao o texto — e depois de limpo os dois viram a
     * mesma pergunta.
     */
    it('menção no início e no fim dão o mesmo resultado', () => {
      expect(semMencoes('@558535141045 qual o faturamento da semana?')).toBe(
        'qual o faturamento da semana?',
      );
      expect(semMencoes('qual o faturamento da semana?\n@558535141045')).toBe(
        'qual o faturamento da semana?',
      );
    });

    it('menção no meio da frase não deixa buraco', () => {
      expect(semMencoes('bom dia @558535141045 tudo certo?')).toBe(
        'bom dia tudo certo?',
      );
    });

    it('várias menções saem todas', () => {
      expect(semMencoes('@558535141045 @5585999998888 quanto vendemos?')).toBe(
        'quanto vendemos?',
      );
    });

    /* O caso "so a mencao": sobra vazio, e quem recebe tem de perguntar o que
     * a pessoa precisa em vez de responder ao nada. */
    it('só a menção sobra vazio, e isso é informação', () => {
      expect(semMencoes('@558535141045')).toBe('');
    });

    it('não come número que não é menção', () => {
      expect(semMencoes('vendemos 558535141045 reais')).toBe(
        'vendemos 558535141045 reais',
      );
      expect(semMencoes('o pedido 12345678 chegou?')).toBe(
        'o pedido 12345678 chegou?',
      );
    });
  });

  describe('o que continua de fora', () => {
    it('mensagem nossa no grupo não volta para processamento', () => {
      expect(extrairMensagemRecebida(evento({ fromMe: true }))).toBeNull();
    });

    it('conversa direta continua sem `grupo` — nada mudou para ela', () => {
      const msg = extrairMensagemRecebida({
        event: 'message',
        session: 'default',
        payload: {
          from: '5585988887777@c.us',
          fromMe: false,
          body: 'oi',
          _data: { Info: { IsGroup: false } },
        },
      });

      expect(msg?.de).toBe('5585988887777@c.us');
      expect(msg?.grupo).toBeUndefined();
    });
  });
});
