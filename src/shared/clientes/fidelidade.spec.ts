import {
  MINIMO_OURO,
  MINIMO_PRATA,
  NIVEIS_DE_FIDELIDADE,
  linhaDoClienteFiel,
  nivelDaPergunta,
  nivelEmPalavras,
  nivelEmSql,
  nivelPorCompras,
  ordemEmSql,
} from './fidelidade';

/**
 * A REGRA DE FIDELIDADE — 09/10/2026.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE.
 *
 * 1. OS CORTES. "Ouro" é uma palavra que a loja usa: o cartão do painel e a
 *    agente têm de dizer o mesmo. O fora-por-um aqui é exatamente o defeito
 *    que o cartão tinha ("5+ compras" para uma regra de 6+).
 *
 * 2. O SQL E O TYPESCRIPT CONCORDAM. São duas formas da mesma regra, e nada
 *    além destes testes impede que um `>=` virasse `>` em só uma delas.
 *
 * 3. NÍVEL INVENTADO NÃO VIRA FILTRO. O modelo escreve o valor do enum e pode
 *    escrever "Diamante". Converter às cegas devolveria lista vazia — e vazio
 *    é indistinguível de "não há nenhum", a forma de erro mais cara daqui.
 * ==========================================================================
 */
describe('o nível de fidelidade', () => {
  describe('os cortes, e o fora-por-um que o painel tinha', () => {
    it('zero compra não é Bronze: é "Sem compras"', () => {
      // 616 dos 1.096 clientes estão aqui. Dobrá-los em Bronze faria o nível
      // mais baixo parecer o mais comum por um motivo que não é fidelidade.
      expect(nivelPorCompras(0)).toBe('Sem compras');
    });

    it('uma compra já é Bronze', () => {
      expect(nivelPorCompras(1)).toBe('Bronze');
    });

    it(`${MINIMO_PRATA - 1} compras ainda é Bronze, e ${MINIMO_PRATA} é Prata`, () => {
      expect(nivelPorCompras(MINIMO_PRATA - 1)).toBe('Bronze');
      expect(nivelPorCompras(MINIMO_PRATA)).toBe('Prata');
    });

    it(`${MINIMO_OURO - 1} compras ainda é Prata — o fora-por-um do cartão`, () => {
      // O cartão do painel dizia "5+ compras" e a regra era 6+. Quem tem
      // exatamente 5 é PRATA, e são 15 clientes na base de hoje.
      expect(nivelPorCompras(MINIMO_OURO - 1)).toBe('Prata');
    });

    it(`${MINIMO_OURO} compras é Ouro, e daí para cima também`, () => {
      expect(nivelPorCompras(MINIMO_OURO)).toBe('Ouro');
      expect(nivelPorCompras(39)).toBe('Ouro');
    });
  });

  describe('o SQL e o TypeScript são a mesma regra', () => {
    /**
     * Avalia o `CASE` gerado como o Postgres avaliaria, sem banco.
     *
     * Não é reimplementar a regra: é LER o SQL que o módulo gerou e aplicá-lo.
     * Se alguém trocar um `>=` por `>` só no gerador de SQL, isto quebra — e
     * é o único jeito de pegar essa divergência sem subir o banco. O
     * `scripts/conferir-fidelidade.ts` prova o mesmo contra a base de verdade.
     */
    const valorDe = (bruto: string): string | number => {
      // 'Sem compras' TEM ESPACO: um `[^'\s]+` aqui deixava o ELSE sem casar
      // e o teste estourava em vez de comparar. A citacao e o delimitador.
      const citado = /^'(.*)'$/.exec(bruto.trim());
      return citado ? citado[1] : Number(bruto.trim());
    };
    const avaliar = (sql: string, n: number): string | number => {
      const ramos = [
        ...sql.matchAll(/WHEN n >= (\d+) THEN ('[^']*'|\d+)/g),
      ].map((m) => ({ corte: Number(m[1]), valor: valorDe(m[2]) }));
      const senao = valorDe(/ELSE ('[^']*'|\d+) END/.exec(sql)![1]);
      return ramos.find((r) => n >= r.corte)?.valor ?? senao;
    };

    it('o CASE de nível dá o mesmo que a função, de 0 a 50 compras', () => {
      const sql = nivelEmSql('n');
      for (let n = 0; n <= 50; n++) {
        expect(avaliar(sql, n)).toBe(nivelPorCompras(n));
      }
    });

    it('a ordem sobe junto com o nível — Ouro é a maior', () => {
      const sql = ordemEmSql('n');
      expect(avaliar(sql, 0)).toBe(0);
      expect(avaliar(sql, 1)).toBe(1);
      expect(avaliar(sql, MINIMO_PRATA)).toBe(2);
      expect(avaliar(sql, MINIMO_OURO)).toBe(3);
    });

    it('a expressão de compras é interpolada, e não fixada em "n"', () => {
      // O painel passa `n`; outra consulta passa `COUNT(v.id)`. Fixar o nome
      // aqui faria o segundo caso gerar SQL inválido.
      expect(nivelEmSql('COUNT(v.id)')).toContain('COUNT(v.id) >=');
    });
  });

  describe('o corte em palavras', () => {
    it('sai das constantes, então não envelhece', () => {
      expect(nivelEmPalavras('Ouro')).toBe(`${MINIMO_OURO} compras ou mais`);
      expect(nivelEmPalavras('Prata')).toBe(
        `de ${MINIMO_PRATA} a ${MINIMO_OURO - 1} compras`,
      );
    });

    it('Bronze diz a faixa inteira, e não só as pontas', () => {
      // "1 ou 2" esqueceria o 2 calado se MINIMO_PRATA subisse para 4.
      expect(nivelEmPalavras('Bronze')).toBe(`de 1 a ${MINIMO_PRATA - 1} compras`);
    });
  });

  describe('o nível que a agente pediu', () => {
    it('reconhece o que existe', () => {
      for (const n of NIVEIS_DE_FIDELIDADE) {
        expect(nivelDaPergunta(n)).toBe(n);
      }
    });

    it('aceita caixa e acento trocados — o modelo escreve como fala', () => {
      expect(nivelDaPergunta('ouro')).toBe('Ouro');
      expect(nivelDaPergunta('  PRATA ')).toBe('Prata');
      expect(nivelDaPergunta('sem compras')).toBe('Sem compras');
    });

    it('DEVOLVE NULL para nível inventado — nunca um filtro que não casa', () => {
      // Este é o teste que importa. "Diamante" virando filtro devolveria
      // lista vazia, e a agente diria "você não tem nenhum cliente Diamante"
      // — uma afirmação falsa sobre uma faixa que não existe.
      expect(nivelDaPergunta('Diamante')).toBeNull();
      expect(nivelDaPergunta('Gold')).toBeNull();
      expect(nivelDaPergunta('')).toBeNull();
      expect(nivelDaPergunta(undefined)).toBeNull();
      expect(nivelDaPergunta(null)).toBeNull();
    });
  });

  describe('a linha do cliente', () => {
    const base = {
      nome: 'Carla Oliveira',
      nivel: 'Ouro' as const,
      compras: 9,
      valorLiquido: 1148377,
      ultimaCompra: new Date('2026-08-12T12:00:00Z'),
      vendedoraNome: 'Marina',
    };

    it('traz nível, compras, valor e a dona da carteira', () => {
      const l = linhaDoClienteFiel(base);
      expect(l).toContain('Carla Oliveira (Ouro)');
      expect(l).toContain('9 compras');
      expect(l).toContain('12/08/2026');
      expect(l).toContain('carteira da Marina');
    });

    it('DIZ que não tem vendedora, em vez de omitir', () => {
      // 19 dos 48 clientes Ouro estão assim. Omitir faria 40% das linhas
      // parecerem um erro de formatação — e esconderia que não têm dona.
      expect(linhaDoClienteFiel({ ...base, vendedoraNome: null })).toContain(
        'SEM VENDEDORA',
      );
    });

    it('não pluraliza uma compra só', () => {
      expect(linhaDoClienteFiel({ ...base, compras: 1 })).toContain('1 compra,');
    });

    it('omite a data quando nunca houve compra', () => {
      const l = linhaDoClienteFiel({
        ...base,
        nivel: 'Sem compras',
        compras: 0,
        valorLiquido: 0,
        ultimaCompra: null,
      });
      expect(l).not.toContain('última em');
      expect(l).toContain('(Sem compras)');
    });
  });
});
