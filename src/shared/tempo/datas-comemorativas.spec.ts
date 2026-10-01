import {
  DIAS_ANTES_DA_DATA,
  anosRecentes,
  datasComemorativas,
  janelasDaDataComemorativa,
  janelasDoMes,
} from './datas-comemorativas';

/**
 * AS JANELAS DE "QUEM COMPRA NAQUELA EPOCA" — 01/10/2026.
 *
 * ==========================================================================
 * O QUE ESTE SPEC PROTEGE E A DATA MOVEL.
 *
 * Tres das seis mudam de dia todo ano: Pascoa, Carnaval e os dois "segundo
 * domingo" (Maes e Pais). Uma janela fixa de MM-DD responderia a pergunta
 * errada em tres das seis datas, e ninguem notaria — a resposta vem com nomes
 * e numeros plausiveis de qualquer jeito.
 * ==========================================================================
 */

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('datas comemorativas — as janelas da epoca', () => {
  describe('a data comemorativa', () => {
    /* ESTE E O TESTE. O resto e contorno. */
    it('a janela TERMINA no dia e comeca 15 dias antes', () => {
      const [j] = janelasDaDataComemorativa('Natal', [2025]);

      expect(iso(j.ate)).toBe('2025-12-25');
      expect(iso(j.de)).toBe('2025-12-10');
    });

    it('cobre o dia inteiro nas duas pontas', () => {
      // A compra das 22h do dia 25 tem de entrar. Janela que para a
      // meia-noite perde a vespera inteira de quem compra tarde.
      const [j] = janelasDaDataComemorativa('Natal', [2025]);

      expect(j.de.getHours()).toBe(0);
      expect(j.ate.getHours()).toBe(23);
      expect(j.ate.getMinutes()).toBe(59);
    });

    it('a data MOVEL anda junto — o Dia das Mães cai em dia diferente a cada ano', () => {
      const [a, b] = janelasDaDataComemorativa('Dia das Mães', [2025, 2026]);

      // 2o domingo de maio: 11/05/2025 e 10/05/2026.
      expect(iso(a.ate)).toBe('2025-05-11');
      expect(iso(b.ate)).toBe('2026-05-10');
      expect(iso(a.ate)).not.toBe(iso(b.ate).replace('2026', '2025'));
    });

    it('a Páscoa também — e é por isso que MM-DD fixo não serve', () => {
      const [a, b] = janelasDaDataComemorativa('Páscoa', [2024, 2025]);

      expect(iso(a.ate)).toBe('2024-03-31');
      expect(iso(b.ate)).toBe('2025-04-20');
    });

    it('uma janela por ano, na ordem em que os anos chegam', () => {
      const js = janelasDaDataComemorativa('Natal', [2023, 2024, 2025]);

      expect(js).toHaveLength(3);
      expect(js.map((j) => j.ate.getFullYear())).toEqual([2023, 2024, 2025]);
    });

    it('sem ano nenhum, janela nenhuma — e nao a carteira inteira', () => {
      expect(janelasDaDataComemorativa('Natal', [])).toHaveLength(0);
    });
  });

  describe('o mês', () => {
    /* ESTE E O TESTE. */
    it('vai do dia 1 ao ÚLTIMO dia, qualquer que ele seja', () => {
      const [jan] = janelasDoMes(1, [2026]);
      const [abr] = janelasDoMes(4, [2026]);

      expect(iso(jan.de)).toBe('2026-01-01');
      expect(iso(jan.ate)).toBe('2026-01-31');
      expect(iso(abr.ate)).toBe('2026-04-30');
    });

    it('fevereiro bissexto fecha no dia 29, sem ninguém saber que ele existe', () => {
      // `new Date(ano, mes, 0)` = ultimo dia do mes anterior. O calendario
      // resolve o bissexto; a conta na mao erraria 2024 e acertaria 2025.
      const [b] = janelasDoMes(2, [2024]);
      const [c] = janelasDoMes(2, [2025]);

      expect(iso(b.ate)).toBe('2024-02-29');
      expect(iso(c.ate)).toBe('2025-02-28');
    });

    it('dezembro de cada ano, para somar os anos', () => {
      const js = janelasDoMes(12, [2023, 2024, 2025]);

      expect(js.map((j) => iso(j.de))).toEqual([
        '2023-12-01',
        '2024-12-01',
        '2025-12-01',
      ]);
    });
  });

  describe('os anos recentes', () => {
    it('inclui o ano de hoje e vem do mais antigo para o mais novo', () => {
      const anos = anosRecentes(5, new Date(2026, 9, 1));

      expect(anos).toEqual([2022, 2023, 2024, 2025, 2026]);
    });
  });

  describe('a lista de nomes', () => {
    it('é a MESMA do cálculo — nome novo aparece no schema sem ninguém lembrar', () => {
      // O `enum` do schema da ferramenta sai desta constante. Se as duas
      // listas divergirem, a agente oferece uma data que o calculo nao conhece
      // e a janela sai vazia, sem erro nenhum.
      const calculadas = datasComemorativas(2026).map((d) => d.nome);

      expect(calculadas).toHaveLength(6);
      for (const nome of calculadas) {
        expect(janelasDaDataComemorativa(nome as never, [2026])).toHaveLength(1);
      }
    });

    it('a constante de 15 dias é a que a janela usa', () => {
      // DE MEIA-NOITE A MEIA-NOITE. A janela termina as 23:59:59.999, entao a
      // diferenca crua da 16 dias — e contar assim seria medir o fim do dia,
      // nao a distancia entre as duas datas.
      const [j] = janelasDaDataComemorativa('Natal', [2025]);
      const ateMeiaNoite = new Date(j.ate);
      ateMeiaNoite.setHours(0, 0, 0, 0);
      const dias = Math.round((ateMeiaNoite.getTime() - j.de.getTime()) / 86_400_000);

      expect(dias).toBe(DIAS_ANTES_DA_DATA);
    });
  });
});
