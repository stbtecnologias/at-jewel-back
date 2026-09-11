import { ClienteRepository } from './cliente.repository';

/**
 * `/clientes/tiers` com sexo e origem em LISTA.
 *
 * O QUE ISTO PROTEGE: em 10/09/2026 o `/analytics` passou a aceitar lista
 * (`53b5c97`) e a tela de Clientes passou a manda-la para as DUAS rotas que
 * usa — mas esta, que e de outro modulo, continuou comparando com `= $n`. Com
 * dois sexos marcados, Total, Clientes Ouro e Fidelidade zeravam, porque a
 * lista virava o texto `{F,M}` e nao casava com ninguem.
 *
 * Conferido em 11/09 contra o banco local, pela rota: F (100) + M (50) = 150.
 */
describe('ClienteRepository.distribuicaoTiers — sexo e origem em lista', () => {
  let query: jest.Mock;
  let repo: ClienteRepository;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    repo = new ClienteRepository({} as never, { query } as never);
  });

  function consultaEParametros(): { sql: string; params: unknown[] } {
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    return { sql, params };
  }

  it('dois sexos vao como UM parametro de lista, com = ANY', async () => {
    await repo.distribuicaoTiers({ sexo: ['F', 'M'] });

    const { sql, params } = consultaEParametros();
    expect(sql).toContain(
      "COALESCE(cp.sexo::text, 'NAO_INFORMADO') = ANY($1::text[])",
    );
    expect(params).toEqual([['F', 'M']]);
  });

  it('origem tambem, e a numeracao dos parametros segue a ordem', async () => {
    await repo.distribuicaoTiers({
      sexo: ['F'],
      origem: ['whatsapp', 'instagram'],
      idadeMin: 30,
    });

    const { sql, params } = consultaEParametros();
    expect(sql).toContain('= ANY($1::text[])');
    expect(sql).toContain(
      "COALESCE(cp.origem_contato::text, 'Nao informado') = ANY($2::text[])",
    );
    expect(sql).toContain('cp.idade >= $3');
    expect(params).toEqual([['F'], ['whatsapp', 'instagram'], 30]);
  });

  it('o recorte demografico traz o perfil junto; sem recorte, nao', async () => {
    await repo.distribuicaoTiers({ sexo: ['F'] });
    expect(consultaEParametros().sql).toContain('LEFT JOIN clientes_perfil cp');

    query.mockClear();
    await repo.distribuicaoTiers(undefined);
    expect(consultaEParametros().sql).not.toContain('clientes_perfil');
  });
});
