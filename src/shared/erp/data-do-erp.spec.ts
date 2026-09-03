import { dataDoErp } from './data-do-erp';

describe('dataDoErp', () => {
  describe('data sem fuso — o formato que o Safira manda', () => {
    // O Brasil nao tem horario de verao desde 2019: America/Sao_Paulo e -03:00
    // o ano inteiro. 12h51 na loja = 15h51 UTC.
    it('deve ler a hora como hora de parede da loja, e nao como UTC', () => {
      const d = dataDoErp('2026-08-05T12:51:22');
      expect(d?.toISOString()).toBe('2026-08-05T15:51:22.000Z');
    });

    // O caso que mais dói: documento so com data. Lido como UTC, ele volta
    // tres horas e cai no DIA ANTERIOR em qualquer relatorio por periodo.
    it('deve manter a meia-noite no proprio dia', () => {
      const d = dataDoErp('2026-08-08T00:00:00');
      expect(d?.toISOString()).toBe('2026-08-08T03:00:00.000Z');
    });

    it('deve funcionar em janeiro, quando o verao do sul nao muda o fuso', () => {
      const d = dataDoErp('2026-01-15T09:00:00');
      expect(d?.toISOString()).toBe('2026-01-15T12:00:00.000Z');
    });
  });

  describe('data com fuso — respeitar o que foi dito', () => {
    // Se um dia ele passar a mandar o fuso, a funcao para de adivinhar.
    it('deve aceitar sufixo Z sem deslocar', () => {
      expect(dataDoErp('2026-08-05T12:51:22Z')?.toISOString()).toBe(
        '2026-08-05T12:51:22.000Z',
      );
    });

    it('deve aceitar deslocamento explicito', () => {
      expect(dataDoErp('2026-08-05T12:51:22-03:00')?.toISOString()).toBe(
        '2026-08-05T15:51:22.000Z',
      );
      expect(dataDoErp('2026-08-05T12:51:22+00:00')?.toISOString()).toBe(
        '2026-08-05T12:51:22.000Z',
      );
    });
  });

  describe('fuso com horario de verao', () => {
    // O Brasil nao tem mais, mas a funcao mede o deslocamento no proprio
    // instante em vez de chumbar -03:00. Um fuso que ainda muda prova que a
    // medida e real e nao uma constante disfarcada.
    it('deve usar o deslocamento vigente na data, e nao um fixo', () => {
      const inverno = dataDoErp('2026-01-15T12:00:00', 'America/New_York');
      const verao = dataDoErp('2026-07-15T12:00:00', 'America/New_York');
      expect(inverno?.toISOString()).toBe('2026-01-15T17:00:00.000Z'); // EST -5
      expect(verao?.toISOString()).toBe('2026-07-15T16:00:00.000Z'); // EDT -4
    });
  });

  describe('bordas', () => {
    it('deve devolver null para ausencia, vazio e lixo', () => {
      expect(dataDoErp(null)).toBeNull();
      expect(dataDoErp(undefined)).toBeNull();
      expect(dataDoErp('')).toBeNull();
      expect(dataDoErp('   ')).toBeNull();
      expect(dataDoErp('ontem')).toBeNull();
    });

    it('deve devolver o proprio Date quando ja recebe um', () => {
      const d = new Date('2026-08-05T15:51:22.000Z');
      expect(dataDoErp(d)).toBe(d);
      expect(dataDoErp(new Date('invalido'))).toBeNull();
    });

    // '1899-12-30' e o zero do Delphi, e chega em `atualizadoem` em 100% das
    // linhas. Nao e usado na ingestao, mas se alguem passar por aqui a funcao
    // tem de devolver uma data e nao explodir.
    it('deve converter o zero do Delphi sem quebrar', () => {
      const d = dataDoErp('1899-12-30T00:00:00');
      expect(d).toBeInstanceOf(Date);
      expect(Number.isNaN(d?.getTime())).toBe(false);
    });
  });
});
