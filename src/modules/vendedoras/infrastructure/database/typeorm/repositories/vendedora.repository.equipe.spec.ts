import { Vendedora } from '../../../../domain/entities/vendedora.entity';
import { VendedoraRepository } from './vendedora.repository';

/**
 * UM UPDATE NÃO PODE APAGAR A EQUIPE — 23/10/2026.
 *
 * ==========================================================================
 * ESTE TESTE NASCEU DE UM ESTRAGO EM PRODUÇÃO, NO MESMO DIA.
 *
 * De manhã mapeei a coluna `equipe_id` para a vendedora nova nascer na equipe
 * padrão. O mapeamento (`toOrm`) vale para os DOIS caminhos — e o `atualizar`
 * monta a entidade a partir da atual mais o PATCH, **sem carregar a equipe**.
 * Resultado: todo update gravava `equipe_id = NULL`.
 *
 * O deploy saiu às 14:10. Às **14:12** a sincronização do ERP tocou nas
 * vendedoras e apagou a equipe de **19 das 23** — o recorte da gerente, que
 * tinha sido cadastrado em produção às 10:23, durou duas horas.
 *
 * E NADA ACUSOU. A coluna ficou nula, a tela da gerente ficou menor, e o
 * único motivo de termos descoberto foi um backup restaurado por outro
 * motivo, à tarde. Defeito que não quebra nada é o que mais demora a
 * aparecer — é a terceira vez que esta frase cabe esta semana.
 *
 * A GUARDA NÃO É LEMBRAR DE CARREGAR O CAMPO. É a `equipe_id` não estar no
 * que um update sabe escrever: quem a grava é o `criar` e o cadastro por SQL.
 * ==========================================================================
 */
describe('VendedoraRepository — a equipe e o que um update escreve', () => {
  const VENDEDORA = Vendedora.create({
    id: 'vd-1',
    nome: 'Camila Brito',
    tipo: 'LOCAL',
    ativo: true,
    statusDisponibilidade: 'DISPONIVEL',
    codigoErp: 'SEED-VD01',
    equipeId: 'eq-1',
  });

  function repositorio() {
    const update = jest.fn().mockResolvedValue(undefined);
    const findOneByOrFail = jest.fn().mockResolvedValue({
      id: 'vd-1',
      nome: 'Camila Brito',
      tipo: 'LOCAL',
      ativo: true,
      statusDisponibilidade: 'DISPONIVEL',
      codigoErp: 'SEED-VD01',
      especialidades: [],
      equipeId: 'eq-1',
    });
    const create = jest.fn((x: unknown) => x);
    const save = jest.fn((x: unknown) => Promise.resolve(x));
    const repo = new VendedoraRepository({
      update,
      findOneByOrFail,
      create,
      save,
    } as never);
    return { repo, update, create };
  }

  /* ESTE É O TESTE. */
  it('atualizar NÃO manda equipe_id — nem como null', async () => {
    const { repo, update } = repositorio();

    await repo.atualizar(VENDEDORA);

    const payload = update.mock.calls[0][1] as Record<string, unknown>;
    expect('equipeId' in payload).toBe(false);
  });

  /*
   * E A PROVA PELO OUTRO LADO: o update continua escrevendo o resto. Se um dia
   * alguém "consertar" tirando o campo errado, este teste cai.
   */
  it('e continua escrevendo o que é dele — nome, ativo, código', async () => {
    const { repo, update } = repositorio();

    await repo.atualizar(VENDEDORA);

    expect(update.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        nome: 'Camila Brito',
        ativo: true,
        codigoErp: 'SEED-VD01',
      }),
    );
  });

  /* NA CRIAÇÃO ELA VAI — é lá que a vendedora nova entra na equipe padrão. */
  it('criar manda a equipe, que é como a vendedora nova nasce dentro dela', async () => {
    const { repo, create } = repositorio();

    await repo.criar(VENDEDORA);

    expect(create.mock.calls[0][0]).toEqual(
      expect.objectContaining({ equipeId: 'eq-1' }),
    );
  });
});
