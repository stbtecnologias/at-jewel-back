import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { CriarProdutoDto } from './criar-produto.dto';
import { CriarProdutosLoteDto } from './criar-produtos-lote.dto';
import { ErpProdutoDto } from '../../../../erp/infrastructure/http/dto/erp-produto.dto';

/**
 * ==========================================================================
 * O PRODUTO SEM CATEGORIA E SEM FAMILIA — 10/11/2026.
 *
 * O integrador mandou o lote e 75 produtos voltaram com 400:
 *
 *   {"statusCode":400,"message":["categoria should not be empty"]}
 *   {"statusCode":400,"message":["familia should not be empty"]}
 *
 * Eram os `@IsNotEmpty()` de `categoria` e `familia`. As pecas existem no ERP
 * — BAU, GIFT CARD, FECHO, CORRENTE, RUBELITA, brincos, colares — e so nao
 * chegavam aqui porque o cadastro do lado de la esta incompleto.
 *
 * DECISAO DO LUCAS: aceitar como vier. *"Queria que ele pudesse enviar também
 * esses produtos sem restrições."*
 *
 * ==========================================================================
 * POR QUE STRING VAZIA, E NAO `NULL`.
 *
 * As tres colunas sao NOT NULL, e os tipos de dominio e de ORM sao `string`,
 * nao `string | null`. `NULL` custaria migracao, troca de tipo nos dois
 * lugares, e os DEZ pontos que interpolam estes campos direto em texto que vai
 * para a vendedora — onde `${null}` imprime a palavra "null":
 *
 *   `${p.descricaoEtiqueta ?? `${p.categoria} ${p.familia}`}`
 *   `${p.categoria} / ${p.familia}`
 *
 * E a casa JA TRATA string vazia como "nao informado", desde antes disto:
 *
 *   COALESCE(NULLIF(p.familia, ''), 'Sem familia')   -- analytics.repository
 *
 * Entao `''` nao e atalho: e a convencao que ja existia.
 * ==========================================================================
 */

const BASE = {
  codigo_erp: 'BAU',
  valor_venda: 100,
};

/**
 * Os erros de validacao, INCLUSIVE OS ANINHADOS.
 *
 * A primeira versao lia so `constraints`, e com isso o teste do lote passava
 * vazio — erro de item vive em `children`, e o pai so carrega a lista. Um
 * teste que passa por nao enxergar nao prova nada.
 */
function erros(cls: never, payload: unknown): string[] {
  const achatar = (es: ValidationError[]): string[] =>
    es.flatMap((e) => [
      ...Object.values(e.constraints ?? {}),
      ...achatar(e.children ?? []),
    ]);
  return achatar(validateSync(plainToInstance(cls, payload) as object));
}

function instancia<T>(cls: never, payload: unknown): T {
  return plainToInstance(cls, payload) as T;
}

describe('o produto que chega sem categoria, familia ou unidade', () => {
  describe('CriarProdutoDto — o caminho que o integrador usa', () => {
    /* ESTE E O TESTE. */
    it('sem os tres campos, NAO e recusado', () => {
      expect(erros(CriarProdutoDto as never, BASE)).toEqual([]);
    });

    it('e os tres chegam como string vazia, nunca undefined', () => {
      const dto = instancia<CriarProdutoDto>(CriarProdutoDto as never, BASE);

      expect(dto.categoria).toBe('');
      expect(dto.familia).toBe('');
      expect(dto.unidade).toBe('');
    });

    /**
     * AS TRES FORMAS DE DIZER "NAO TENHO" — pergunta dele em 10/11/2026.
     *
     * O integrador pode mandar o campo ausente, `null` ou `""`, e as tres
     * precisam dar no mesmo. Esta ultima ja funcionava quando o teste foi
     * escrito — `''` e string valida e o transformador a devolve intacta —,
     * e esta aqui para NAO PARAR de funcionar: e a forma que mais sai de
     * export de ERP, onde campo sem valor vira coluna vazia e nao ausente.
     */
    it('string vazia tambem passa, e continua vazia', () => {
      const payload = { ...BASE, categoria: '', familia: '', unidade: '' };

      expect(erros(CriarProdutoDto as never, payload)).toEqual([]);

      const dto = instancia<CriarProdutoDto>(CriarProdutoDto as never, payload);
      expect(dto.categoria).toBe('');
      expect(dto.familia).toBe('');
      expect(dto.unidade).toBe('');
    });

    it('`null` explicito tambem vira vazio', () => {
      const dto = instancia<CriarProdutoDto>(CriarProdutoDto as never, {
        ...BASE,
        categoria: null,
        familia: null,
        unidade: null,
      });

      expect(dto.categoria).toBe('');
      expect(dto.familia).toBe('');
      expect(dto.unidade).toBe('');
    });

    /* O CAMINHO NORMAL NAO MUDA — 7.423 produtos dependem dele. */
    it('o que vem preenchido continua chegando intacto', () => {
      const dto = instancia<CriarProdutoDto>(CriarProdutoDto as never, {
        ...BASE,
        categoria: 'JEWEL',
        familia: 'BRINCO',
        unidade: 'UN',
      });

      expect(erros(CriarProdutoDto as never, { ...BASE, categoria: 'JEWEL' })).toEqual([]);
      expect(dto.categoria).toBe('JEWEL');
      expect(dto.familia).toBe('BRINCO');
      expect(dto.unidade).toBe('UN');
    });

    it('o que NAO e texto continua sendo recusado', () => {
      // Afrouxar o obrigatorio nao e afrouxar o tipo: um numero no lugar da
      // categoria segue sendo erro, e com a mensagem certa.
      const e = erros(CriarProdutoDto as never, { ...BASE, categoria: 42 });

      expect(e.join(' ')).toContain('categoria');
    });
  });

  describe('CriarProdutosLoteDto — herda, porque reusa o mesmo DTO', () => {
    it('um lote de produtos sem classificacao passa inteiro', () => {
      expect(
        erros(CriarProdutosLoteDto as never, {
          produtos: [BASE, { codigo_erp: 'GIFT CARD', valor_venda: 500 }],
        }),
      ).toEqual([]);
    });
  });

  describe('ErpProdutoDto — a outra porta, pela mesma razao', () => {
    const BASE_ERP = {
      evento_id: '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607',
      codigo_erp: 'RUBELITA',
      valor_venda: 100,
    };

    it('sem os tres campos, NAO e recusado', () => {
      expect(erros(ErpProdutoDto as never, BASE_ERP)).toEqual([]);
    });

    it('e os tres chegam como string vazia', () => {
      const dto = instancia<ErpProdutoDto>(ErpProdutoDto as never, BASE_ERP);

      expect(dto.categoria).toBe('');
      expect(dto.familia).toBe('');
      expect(dto.unidade).toBe('');
    });
  });
});
