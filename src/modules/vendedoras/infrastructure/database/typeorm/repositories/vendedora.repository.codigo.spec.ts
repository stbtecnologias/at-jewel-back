import { VendedoraRepository } from './vendedora.repository';

/**
 * O SQL QUE GERA O `VD-####` — a guarda que faltava.
 *
 * ==========================================================================
 * POR QUE ESTE TESTE EXISTE, e ele e resposta a um defeito real.
 *
 * De 08/09/2026 (53e2d39) a 24/09/2026 esta consulta esteve QUEBRADA em
 * producao. O template literal tinha sido aberto e nunca fechado — faltava o
 * `$'` do fim da regex —, e a string engoliu o corpo do `listar()` inteiro.
 * O SQL que chegava ao Postgres terminava em `createQueryBuilder('v')`:
 *
 *     syntax error at or near "v"   (42601)
 *
 * DEZESSEIS DIAS SEM NINGUEM VER, por dois motivos que se somaram:
 *
 *   1. o `tsc` nao tem como acusar — template literal aceita qualquer texto
 *      dentro, entao o arquivo era TypeScript valido;
 *   2. este caminho so roda quando a vendedora nasce SEM codigo do ERP. As 22
 *      que existiam vieram do ERP, com codigo. O Lucas foi o primeiro a
 *      cadastrar uma pelo CRM, em 24/09.
 *
 * O QUE ESTE TESTE PROTEGE nao e o resultado — e a FORMA do SQL. Ele nao
 * precisa de banco: espia o texto que sai para o driver e recusa um texto que
 * tenha vazado codigo para dentro. E a unica forma barata de pegar esta classe
 * de estrago, que nenhum teste de comportamento veria.
 * ==========================================================================
 */
describe('VendedoraRepository.proximoCodigoInterno — a forma do SQL', () => {
  function repositorio(retorno: Array<{ codigo_erp: string }>) {
    const query = jest.fn().mockResolvedValue(retorno);
    const repo = new VendedoraRepository({
      manager: { query },
    } as never);
    return { repo, query };
  }

  /** O SQL que de fato saiu para o driver. */
  async function sqlGerado(retorno: Array<{ codigo_erp: string }> = []) {
    const { repo, query } = repositorio(retorno);
    await repo.proximoCodigoInterno();
    return (query.mock.calls[0][0] as string).replace(/\s+/g, ' ').trim();
  }

  it('fecha a regex do prefixo — era exatamente isto que faltava', async () => {
    expect(await sqlGerado()).toContain("codigo_erp ~ '^VD-[0-9]+$'");
  });

  it('chega inteiro ao driver, do SELECT ao LIMIT', async () => {
    const sql = await sqlGerado();

    expect(sql).toMatch(/^SELECT codigo_erp FROM vendedoras/);
    expect(sql).toContain('ORDER BY (substring(codigo_erp from 4))::int DESC');
    expect(sql).toMatch(/LIMIT 1$/);
  });

  /**
   * A ASSINATURA DO ESTRAGO DE 08/09: codigo do repositorio dentro da string.
   * Se um dia outro bloco vazar para ca, e por aqui que aparece.
   */
  it('nao carrega codigo TypeScript vazado para dentro da string', async () => {
    const sql = await sqlGerado();

    for (const vazamento of ['createQueryBuilder', 'andWhere', 'this.repo', 'async ', '=>']) {
      expect(sql).not.toContain(vazamento);
    }
  });

  describe('a sequencia', () => {
    it('base vazia comeca em VD-0001', async () => {
      const { repo } = repositorio([]);
      expect(await repo.proximoCodigoInterno()).toBe('VD-0001');
    });

    it('anda a partir do ultimo, com quatro digitos', async () => {
      const { repo } = repositorio([{ codigo_erp: 'VD-0007' }]);
      expect(await repo.proximoCodigoInterno()).toBe('VD-0008');
    });

    /**
     * Ordenar por TEXTO poria "VD-9" depois de "VD-10" e repetiria um codigo
     * ja usado — por isso o `::int` no ORDER BY. Aqui o teste so confirma que
     * o numero e lido como numero na virada de casa.
     */
    it('atravessa a virada de casa sem repetir', async () => {
      const { repo } = repositorio([{ codigo_erp: 'VD-0099' }]);
      expect(await repo.proximoCodigoInterno()).toBe('VD-0100');
    });
  });
});
