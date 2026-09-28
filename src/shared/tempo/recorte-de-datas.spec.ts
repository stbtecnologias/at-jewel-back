import { datasDeRecorte } from './recorte-de-datas';

/**
 * O PARSER DO PERIODO LIVRE — 28/09/2026.
 *
 * ==========================================================================
 * O QUE ELE PROTEGE: A RESPOSTA ERRADA E MUDA.
 *
 * Quem preenche estas datas e o MODELO, convertendo "ultimos 6 meses" em
 * `de`/`ate`. Ele acerta quase sempre, e "quase" e o motivo de tudo isto
 * existir: uma data torta aceita vira um periodo errado que NINGUEM percebe,
 * porque o numero sai com a mesma cara de sempre.
 *
 * Devolvendo `null`, quem chama cai no atalho — que tambem pode ser outro
 * periodo, mas e um periodo EXPLICADO: a agente diz qual recorte usou.
 * ==========================================================================
 */
describe('datasDeRecorte', () => {
  describe('aceita', () => {
    it('um intervalo normal', () => {
      const r = datasDeRecorte('2026-04-01', '2026-09-28')!;

      expect(r.de.getFullYear()).toBe(2026);
      expect(r.de.getMonth() + 1).toBe(4);
      expect(r.de.getDate()).toBe(1);
      expect(r.ate.getDate()).toBe(28);
    });

    it('o mesmo dia nas duas pontas — um dia so e um intervalo', () => {
      expect(datasDeRecorte('2026-08-15', '2026-08-15')).not.toBeNull();
    });

    it('29 de fevereiro em ano bissexto', () => {
      // 2028 e bissexto. Se a validacao fosse uma tabela de dias por mes
      // escrita a mao, este seria o caso que ela erraria.
      expect(datasDeRecorte('2028-02-29', '2028-03-01')).not.toBeNull();
    });

    it('espaco em volta nao atrapalha', () => {
      expect(datasDeRecorte(' 2026-04-01 ', ' 2026-09-28 ')).not.toBeNull();
    });
  });

  describe('recusa — e a recusa cai no atalho, nao em erro', () => {
    it.each([
      ['so o inicio', '2026-04-01', undefined],
      ['so o fim', undefined, '2026-09-28'],
      ['nenhum dos dois', undefined, undefined],
      ['vazio', '', ''],
      ['formato brasileiro', '01/04/2026', '28/09/2026'],
      ['com hora junto', '2026-04-01T10:00', '2026-09-28T10:00'],
      ['texto solto', 'ultimos 6 meses', 'hoje'],
      ['ano de dois digitos', '26-04-01', '26-09-28'],
      ['inicio depois do fim', '2026-09-28', '2026-04-01'],
    ])('%s', (_nome, de, ate) => {
      expect(datasDeRecorte(de, ate)).toBeNull();
    });

    describe('data que NAO EXISTE', () => {
      // `new Date('2026-02-31')` nao lanca: devolve 3 de marco, CALADO. Sem a
      // comparacao do dia de volta, uma data impossivel viraria uma janela
      // plausivel — e o relatorio sairia de um periodo que ninguem pediu.
      it.each([
        ['31 de fevereiro', '2026-02-31'],
        ['29 de fevereiro fora do bissexto', '2026-02-29'],
        ['31 de abril', '2026-04-31'],
        ['mes 13', '2026-13-01'],
        ['mes 00', '2026-00-10'],
        ['dia 00', '2026-04-00'],
        ['dia 32', '2026-04-32'],
      ])('%s', (_nome, de) => {
        expect(datasDeRecorte(de, '2026-12-31')).toBeNull();
      });
    });
  });

  it('o inicio e meia-noite local — o fim quem abraca e o `fimDoDia`', () => {
    // A janela inteira do dia final e responsabilidade do
    // `ConsultarVendasUseCase`. Aqui as duas pontas saem como meia-noite, e
    // este teste existe para que isso continue explicito: mudar aqui sem
    // mudar la perderia um dia de faturamento todo mes.
    const r = datasDeRecorte('2026-08-01', '2026-08-31')!;

    expect(r.de.getHours()).toBe(0);
    expect(r.ate.getHours()).toBe(0);
  });
});
