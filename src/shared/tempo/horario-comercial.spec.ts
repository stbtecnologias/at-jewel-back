import {
  ABRE_AS,
  FECHA_AS,
  MINUTOS_DE_EXPEDIENTE_POR_DIA,
  dentroDoExpediente,
  minutosCorridos,
  minutosDeExpediente,
} from './horario-comercial';

/**
 * O RELOGIO DA LOJA — ANA-14, 29/09/2026.
 *
 * ==========================================================================
 * O ERRO QUE ESTES TESTES EXISTEM PARA IMPEDIR NAO QUEBRA NADA.
 *
 * Ele troca o PRIMEIRO LUGAR do ranking de "quem responde mais rapido", e o
 * numero continua plausivel. Quem pega mensagem de madrugada aparece como a
 * pior da equipe justamente por atender cedo.
 * ==========================================================================
 */
const em = (dia: number, hora: number, minuto = 0) =>
  new Date(2026, 8, dia, hora, minuto, 0, 0); // setembro/2026

describe('o horário comercial', () => {
  describe('dentro do mesmo dia', () => {
    it('duas horas no meio do expediente são duas horas', () => {
      expect(minutosDeExpediente(em(29, 10), em(29, 12))).toBe(120);
    });

    it('o que começa antes de abrir só conta a partir da abertura', () => {
      // 06h -> 09h: só das 08h às 09h.
      expect(minutosDeExpediente(em(29, 6), em(29, 9))).toBe(60);
    });

    it('o que passa do fechamento para na hora de fechar', () => {
      // 18h -> 22h: só das 18h às 19h.
      expect(minutosDeExpediente(em(29, 18), em(29, 22))).toBe(60);
    });

    it('inteiramente fora do expediente é zero', () => {
      expect(minutosDeExpediente(em(29, 20), em(29, 23))).toBe(0);
      expect(minutosDeExpediente(em(29, 2), em(29, 5))).toBe(0);
    });
  });

  /*
   * ESTE E O CASO QUE MOTIVOU TUDO.
   *
   * Cliente escreve 23h40, vendedora responde 8h10. Corrido: 8h30. No relogio
   * da loja: 10 minutos — ela respondeu assim que abriu.
   */
  describe('a virada do dia', () => {
    it('23h40 -> 8h10 são DEZ minutos de loja, e 8h30 corridos', () => {
      const escreveu = em(29, 23, 40);
      const respondeu = em(30, 8, 10);

      expect(minutosDeExpediente(escreveu, respondeu)).toBe(10);
      expect(minutosCorridos(escreveu, respondeu)).toBe(510);
    });

    it('o expediente sempre conta menos que o corrido, ou igual', () => {
      const casos: Array<[Date, Date]> = [
        [em(29, 23, 40), em(30, 8, 10)],
        [em(29, 9), em(29, 17)],
        [em(29, 18), em(30, 9)],
        [em(28, 7), em(30, 20)],
      ];
      for (const [a, b] of casos) {
        expect(minutosDeExpediente(a, b)).toBeLessThanOrEqual(minutosCorridos(a, b));
      }
    });
  });

  describe('vários dias', () => {
    it('um dia inteiro de espera é um expediente', () => {
      // Abre às 08h de um dia até as 08h do seguinte: um expediente cheio.
      expect(minutosDeExpediente(em(29, ABRE_AS), em(30, ABRE_AS)))
        .toBe(MINUTOS_DE_EXPEDIENTE_POR_DIA);
    });

    it('três dias somam três expedientes', () => {
      expect(minutosDeExpediente(em(28, ABRE_AS), em(31, ABRE_AS)))
        .toBe(MINUTOS_DE_EXPEDIENTE_POR_DIA * 3);
    });
  });

  /*
   * SETE DIAS POR SEMANA — decisao do Lucas em 29/09/2026: o telefone
   * corporativo recebe cliente sabado e domingo.
   *
   * Excluir o fim de semana faria a mensagem de sabado 10h respondida 10h05
   * contar como DOIS DIAS de demora, porque o relogio so voltaria na segunda.
   * A vendedora que atendeu no sabado viraria a mais lenta do ranking.
   */
  describe('o fim de semana conta como qualquer dia', () => {
    // 2026-09-26 é sábado; 2026-09-27, domingo.
    it('sábado 10h -> 10h05 são cinco minutos, e não dois dias', () => {
      expect(minutosDeExpediente(em(26, 10), em(26, 10, 5))).toBe(5);
    });

    it('domingo vale igual', () => {
      expect(minutosDeExpediente(em(27, 9), em(27, 11))).toBe(120);
    });

    it('sexta 18h -> segunda 9h NÃO pula o fim de semana', () => {
      // sexta 18-19 (60) + sábado (660) + domingo (660) + segunda 8-9 (60)
      const total = minutosDeExpediente(em(25, 18), em(28, 9));
      expect(total).toBe(60 + MINUTOS_DE_EXPEDIENTE_POR_DIA * 2 + 60);
    });
  });

  describe('as bordas', () => {
    it('fim antes do início é zero, e não negativo', () => {
      expect(minutosDeExpediente(em(29, 15), em(29, 10))).toBe(0);
      expect(minutosCorridos(em(29, 15), em(29, 10))).toBe(0);
    });

    it('mesmo instante é zero', () => {
      expect(minutosDeExpediente(em(29, 10), em(29, 10))).toBe(0);
    });

    it.each([
      [ABRE_AS - 1, false],
      [ABRE_AS, true],
      [12, true],
      [FECHA_AS - 1, true],
      [FECHA_AS, false],
      [23, false],
    ])('às %sh dentro do expediente? %s', (hora, esperado) => {
      expect(dentroDoExpediente(em(29, hora))).toBe(esperado);
    });
  });
});
