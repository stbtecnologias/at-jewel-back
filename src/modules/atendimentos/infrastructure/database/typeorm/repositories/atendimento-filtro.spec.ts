import { montarFiltro } from './atendimento.repository';

/**
 * O WHERE DA AUDITORIA — 30/09/2026.
 *
 * ==========================================================================
 * ESTE ARQUIVO NASCEU DE UM `$` QUE SUMIU.
 *
 * Em 22/09 o commit `4edd9ae` trocou `$${params.length}` por `${params.length}`
 * numa condicao. O SQL passou a dizer `v.aberto_em >= 2`, e o Postgres recusa
 * no parse — nao existe `timestamptz >= integer`. Toda consulta de auditoria
 * com `de` estourava.
 *
 * FICOU OITO DIAS FORA, e o motivo importa mais que o defeito: nao havia quem
 * reclamasse. A tela `/admin/auditoria` esta fora do menu desde 08/09, e o
 * unico caminho vivo e a ferramenta `feedbacks_de_vendedora`, cujo erro vira
 * "nao consegui consultar isso agora" — a MESMA frase de uma falha
 * passageira. A agente pedia desculpa e seguia.
 *
 * Por isso o teste principal daqui NAO e sobre o campo `de`. E um INVARIANTE
 * sobre todas as condicoes: todo parametro empurrado tem de aparecer como
 * `$N`, e nenhuma comparacao pode ter numero solto do lado direito. Um teste
 * por campo protegeria o `de` e deixaria o proximo passar.
 * ==========================================================================
 */

/** Um filtro com TODOS os campos que geram condicao. */
const CHEIO = {
  id: '11111111-1111-1111-1111-111111111111',
  vendedoraId: '22222222-2222-2222-2222-222222222222',
  etapa: 'EM_NEGOCIACAO' as const,
  apenasAbertos: true,
  de: new Date('2026-09-01T00:00:00-03:00'),
  ate: new Date('2026-09-30T23:59:59-03:00'),
  clienteNome: 'Marina',
};

describe('montarFiltro — o WHERE da auditoria', () => {
  describe('o invariante que o defeito de 22/09 violou', () => {
    it('todo parametro empurrado aparece como $N no WHERE', () => {
      const { where, params } = montarFiltro(CHEIO);

      const indices = [...where.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));

      expect(indices).toHaveLength(params.length);
      // E sao exatamente 1..N, sem buraco e sem repetido — um `$` perdido
      // deixaria o conjunto menor que `params`.
      expect([...indices].sort((a, b) => a - b)).toEqual(
        params.map((_, i) => i + 1),
      );
    });

    it('nenhuma comparacao tem numero solto do lado direito', () => {
      const { where } = montarFiltro(CHEIO);

      // `>= 2` em vez de `>= $2` — a forma exata do defeito, em qualquer
      // operador e qualquer condicao.
      expect(where).not.toMatch(/(?:>=|<=|<|>|=|ILIKE|LIKE)\s+\d/);
    });

    it('`de` sai como $N — a condicao que quebrou', () => {
      const { where, params } = montarFiltro({ de: CHEIO.de });

      expect(where).toBe('WHERE v.aberto_em >= $1');
      expect(params).toEqual([CHEIO.de]);
    });

    it('`de` e `ate` juntos nao colidem de indice', () => {
      const { where, params } = montarFiltro({ de: CHEIO.de, ate: CHEIO.ate });

      expect(where).toBe('WHERE v.aberto_em >= $1 AND v.aberto_em <= $2');
      expect(params).toEqual([CHEIO.de, CHEIO.ate]);
    });
  });

  describe('o que ja estava certo, e precisa continuar', () => {
    it('sem filtro nenhum, o WHERE some — nao vira `WHERE`', () => {
      expect(montarFiltro({})).toEqual({ where: '', params: [] });
    });

    it('`apenasAbertos` e predicado fixo e NAO consome parametro', () => {
      const { where, params } = montarFiltro({ apenasAbertos: true });

      expect(where).toBe('WHERE v.desfecho IS NULL');
      expect(params).toEqual([]);
    });

    it('`apenasAbertos: false` nao entra no WHERE', () => {
      expect(montarFiltro({ apenasAbertos: false }).where).toBe('');
    });

    it('o nome do cliente vai por parametro, com os curingas escapados', () => {
      // O `%` digitado por quem busca nao pode virar "traga todo mundo".
      const { where, params } = montarFiltro({ clienteNome: '100%' });

      expect(where).toBe('WHERE cl.nome ILIKE $1');
      expect(params[0]).toBe('%100\\%%');
    });

    it('nenhum valor e interpolado na string — o WHERE so tem $N', () => {
      const { where } = montarFiltro(CHEIO);

      expect(where).not.toContain(CHEIO.id);
      expect(where).not.toContain(CHEIO.vendedoraId);
      expect(where).not.toContain('Marina');
      expect(where).not.toContain('EM_NEGOCIACAO');
    });

    it('as condicoes entram todas, unidas por AND', () => {
      const { where, params } = montarFiltro(CHEIO);

      expect(where.startsWith('WHERE ')).toBe(true);
      expect(where.split(' AND ')).toHaveLength(7);
      // seis parametros: `apenasAbertos` e a condicao que nao consome nenhum.
      expect(params).toHaveLength(6);
    });
  });
});
