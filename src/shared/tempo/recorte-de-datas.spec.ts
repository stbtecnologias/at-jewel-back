import { dataDeCorte, datasDeRecorte } from './recorte-de-datas';

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

/**
 * A DATA DE CORTE DE "QUEM ESTA PARADO" — 01/10/2026.
 *
 * ==========================================================================
 * TRES FORMAS DE DIZER O MESMO RECORTE, E UMA ORDEM ENTRE ELAS.
 *
 * Ate hoje so existia `meses`. "Ha 45 dias" chegava como 1 ou 2 meses, porque
 * era o unico campo que o modelo tinha — e a resposta vinha de um recorte que
 * ninguem pediu, sem erro nenhum aparecer.
 * ==========================================================================
 */
describe('dataDeCorte — quem nao compra desde quando', () => {
  const agora = new Date(2026, 9, 1, 15, 0, 0); // 01/10/2026, 15h

  /* ESTE E O TESTE. O resto e contorno. */
  it('a DATA dita vence os outros dois — e a forma mais especifica', () => {
    const d = dataDeCorte({ meses: 6, dias: 45, desde: '2026-07-01' }, agora);

    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth() + 1).toBe(7);
    expect(d.getDate()).toBe(1);
  });

  it('dias vence meses, porque carrega mais informacao', () => {
    const d = dataDeCorte({ meses: 6, dias: 45 }, agora);

    // 45 dias antes de 01/10 = 17/08.
    expect(d.getMonth() + 1).toBe(8);
    expect(d.getDate()).toBe(17);
  });

  it('dias sozinho', () => {
    const d = dataDeCorte({ dias: 10 }, agora);

    expect(d.getMonth() + 1).toBe(9);
    expect(d.getDate()).toBe(21);
  });

  it('meses sozinho', () => {
    const d = dataDeCorte({ meses: 3 }, agora);

    expect(d.getMonth() + 1).toBe(7);
    expect(d.getDate()).toBe(1);
  });

  it('SEM NADA, seis meses — o mesmo padrao de antes', () => {
    const d = dataDeCorte({}, agora);

    expect(d.getMonth() + 1).toBe(4);
    expect(d.getDate()).toBe(1);
  });

  it('data impossivel cai no padrao, em vez de virar outro mes CALADO', () => {
    // `new Date('2026-02-31')` vira 3 de marco sem avisar. O parser recusa, e
    // recusar aqui significa seis meses — nao uma janela plausivel e errada.
    const d = dataDeCorte({ desde: '2026-02-31' }, agora);

    expect(d.getMonth() + 1).toBe(4);
  });

  it('numero zero ou negativo nao vira recorte', () => {
    expect(dataDeCorte({ meses: 0 }, agora).getMonth() + 1).toBe(4);
    expect(dataDeCorte({ dias: -5 }, agora).getMonth() + 1).toBe(4);
  });

  it('NUNCA devolve nulo: a pergunta "quem esta parado" sempre tem resposta', () => {
    for (const entrada of [{}, { desde: 'ontem' }, { meses: NaN }]) {
      expect(dataDeCorte(entrada, agora)).toBeInstanceOf(Date);
    }
  });
});
