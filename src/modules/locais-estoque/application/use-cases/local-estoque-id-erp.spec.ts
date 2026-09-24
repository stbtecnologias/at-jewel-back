import { LocalEstoque } from '../../domain/entities/local-estoque.entity';
import { AtualizarLocalEstoqueUseCase } from './atualizar-local-estoque.use-case';
import { BuscarLocalEstoquePorIdErpUseCase } from './buscar-local-estoque-por-id-erp.use-case';
import { CriarLocalEstoqueUseCase } from './criar-local-estoque.use-case';

/**
 * O ID DO ERP DO LOCAL: CANONICO PARA CASAR, FIEL PARA ECOAR — migracao 65.
 *
 * ==========================================================================
 * DE ONDE ISTO VEIO, em 24/09/2026:
 *
 * O local de estoque passou a ser aceito como ponta da movimentacao. Mas o
 * `id_erp` dele estava gravado "009000000018" e a `Movimentacao` do Safira
 * chega com 9000000018 — nunca casariam.
 *
 * Normalizar resolve o casamento e cria outro problema, que o Alessandro ja
 * tinha reparado nas operacoes em 23/09: manda com zeros, recebe sem. Por isso
 * o par — `id_erp` canonico, `id_erp_bruto` para o eco.
 * ==========================================================================
 */
describe('Local de estoque — id do ERP normalizado, eco fiel', () => {
  const COM_ZEROS = '009000000018';
  const SEM_ZEROS = '9000000018';

  function repo(existente: LocalEstoque | null = null) {
    return {
      criar: jest.fn((e: LocalEstoque) => Promise.resolve(e)),
      atualizar: jest.fn((e: LocalEstoque) => Promise.resolve(e)),
      buscarPorId: jest.fn().mockResolvedValue(existente),
      buscarPorIdErp: jest.fn().mockResolvedValue(null),
      buscarPorCodigoErp: jest.fn().mockResolvedValue(null),
      listar: jest.fn(),
      remover: jest.fn(),
    };
  }

  describe('ao criar', () => {
    it('grava a chave sem os zeros e o bruto como veio', async () => {
      const r = repo();
      const local = await new CriarLocalEstoqueUseCase(r as never).execute({
        idErp: COM_ZEROS,
        nome: 'ESTOQUE',
      });

      expect(local.idErp).toBe(SEM_ZEROS);
      expect(local.idErpBruto).toBe(COM_ZEROS);
    });

    /** A resposta e o unico lugar onde o bruto aparece — e ele vence. */
    it('a resposta devolve a grafia que ele mandou', async () => {
      const local = await new CriarLocalEstoqueUseCase(repo() as never).execute({
        idErp: COM_ZEROS,
        nome: 'ESTOQUE',
      });

      expect(local.toPublic().idErpLocal).toBe(COM_ZEROS);
    });

    /**
     * A DUPLICATA E PROCURADA PELO CANONICO. Mandar "9000000018" depois de ter
     * gravado "009000000018" e o MESMO local — sem normalizar aqui, nasceria
     * uma segunda linha para o mesmo lugar.
     */
    it('procura duplicata pelo id normalizado', async () => {
      const r = repo();
      await new CriarLocalEstoqueUseCase(r as never).execute({
        idErp: COM_ZEROS,
        nome: 'ESTOQUE',
      });

      expect(r.buscarPorIdErp).toHaveBeenCalledWith(SEM_ZEROS);
    });
  });

  describe('ao atualizar', () => {
    const ATUAL = LocalEstoque.create({
      id: 'loc-1',
      idErp: SEM_ZEROS,
      idErpBruto: COM_ZEROS,
      codigoErp: 'E00001',
      nome: 'ESTOQUE',
      ativo: true,
    });

    it('campo ausente no PATCH preserva o par inteiro', async () => {
      const local = await new AtualizarLocalEstoqueUseCase(
        repo(ATUAL) as never,
      ).execute('loc-1', { nome: 'ESTOQUE PRINCIPAL' });

      expect(local.idErp).toBe(SEM_ZEROS);
      expect(local.idErpBruto).toBe(COM_ZEROS);
    });

    it('id novo atualiza canonico e bruto juntos', async () => {
      const local = await new AtualizarLocalEstoqueUseCase(
        repo(ATUAL) as never,
      ).execute('loc-1', { idErp: '000001154671' });

      expect(local.idErp).toBe('1154671');
      expect(local.idErpBruto).toBe('000001154671');
    });
  });

  /**
   * Ele cola o que tem em maos, e o que ele tem vem das duas formas. As duas
   * precisam achar o mesmo registro.
   */
  describe('ao buscar pelo id do ERP', () => {
    it.each([COM_ZEROS, SEM_ZEROS, '  9000000018  '])(
      'acha com %p, porque a chave e normalizada',
      async (entrada) => {
        const r = repo();
        r.buscarPorIdErp = jest.fn().mockResolvedValue(
          LocalEstoque.create({
            id: 'loc-1',
            idErp: SEM_ZEROS,
            idErpBruto: COM_ZEROS,
            nome: 'ESTOQUE',
            ativo: true,
          }),
        );

        await new BuscarLocalEstoquePorIdErpUseCase(r as never).execute(entrada);

        expect(r.buscarPorIdErp).toHaveBeenCalledWith(SEM_ZEROS);
      },
    );
  });

  /**
   * As linhas gravadas ANTES da migracao 65 ficam com o bruto nulo — o backfill
   * as cobre, mas um banco que nao rodou ainda nao pode quebrar o eco.
   */
  it('sem bruto, a resposta cai no canonico', () => {
    const local = LocalEstoque.create({
      id: 'loc-1',
      idErp: SEM_ZEROS,
      idErpBruto: null,
      nome: 'ESTOQUE',
      ativo: true,
    });

    expect(local.toPublic().idErpLocal).toBe(SEM_ZEROS);
  });
});
