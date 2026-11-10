import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { AtualizarProdutoDto } from './atualizar-produto.dto';

/**
 * ==========================================================================
 * A TERCEIRA PORTA — 10/11/2026, a tarde.
 *
 * Pela manha fechamos duas: `POST /produtos` (e o lote, que reusa o mesmo
 * DTO) e `POST /erp/produtos`. Subiu em producao as 14:13. Horas depois o
 * integrador testou e voltou:
 *
 *   {"statusCode":400,"message":["categoria should not be empty"]}
 *
 * O codigo era BR26310 — que JA EXISTE na base desde 11/09, com categoria
 * JEWEL e familia BRINCO. Ele nao estava criando: estava ATUALIZANDO, por
 * `PATCH /produtos/:id`, com este corpo:
 *
 *   { "id_erp_produto": "000001386287", "categoria": "",
 *     "familia": "BRINCO", "unidade": "PC", ... }
 *
 * Dos tres campos que tinham `@IsNotEmpty()`, so `categoria` veio vazio — e
 * por isso a mensagem trouxe um nome so. A regra valia em dois caminhos de
 * tres, e uma regra que vale em dois caminhos de tres nao e uma regra.
 *
 * ==========================================================================
 * POR QUE AQUI O CONSERTO NAO E O MESMO DA CRIACAO.
 *
 * Na criacao cada campo ganhou inicializador (`categoria: string = ''`),
 * porque `@Transform` NAO RODA para chave ausente do JSON. Aqui o mesmo
 * inicializador seria destrutivo: o use case faz atualizacao parcial por
 * ausencia —
 *
 *   categoria: input.categoria !== undefined ? input.categoria
 *                                            : existente.categoria
 *
 * — entao `''` em chave ausente faria TODO PATCH PARCIAL apagar a
 * classificacao da peca. Ausente tem de continuar chegando `undefined`.
 *
 * Por isso o transform daqui e o `vazioSeNulo`, que mexe so no `null`, e nao
 * o `textoOuVazio` da criacao, que tambem cobre `undefined`. E por isso o
 * teste do campo ausente esta aqui: ele nasce verde, e o trabalho dele e
 * ficar vermelho no dia em que alguem "padronizar" os dois DTOs.
 * ==========================================================================
 */

/** Os erros de validacao, inclusive os aninhados. */
function erros(payload: unknown): string[] {
  const achatar = (es: ValidationError[]): string[] =>
    es.flatMap((e) => [
      ...Object.values(e.constraints ?? {}),
      ...achatar(e.children ?? []),
    ]);
  return achatar(validateSync(plainToInstance(AtualizarProdutoDto, payload)));
}

function instancia(payload: unknown): AtualizarProdutoDto {
  return plainToInstance(AtualizarProdutoDto, payload);
}

/** O payload do integrador, como ele mandou. */
const DELE = {
  id_erp_produto: '000001386287',
  descricao_etiqueta: 'BRINCO SOL.FANCY 10.06 CTS OA 18K 7.50G',
  categoria: '',
  familia: 'BRINCO',
  colecao: 'CONSIGNADO',
  cor: 'OB 18K',
  tamanho: '',
  tipo_pedra: 'FY',
  colecao_pedra: '',
  unidade: 'PC',
  peso_gramas: 0.0,
  margem_percentual: 2.5,
  valor_compra: 1399000.0,
  valor_venda: 1399000.0,
  observacao: '',
  foto_url: 'http://www.conexatecnologia.com/clientes/ATJewel/BR26310.png',
  ativo: true,
};

describe('PATCH /produtos/:id — a peca que perde a classificacao', () => {
  /* ESTE E O TESTE. */
  it('o payload do integrador NAO e mais recusado', () => {
    expect(erros(DELE)).toEqual([]);
  });

  it('e a categoria vazia dele chega vazia, para gravar', () => {
    expect(instancia(DELE).categoria).toBe('');
  });

  describe('as tres formas de dizer "nao tenho"', () => {
    it('string vazia passa, e chega vazia', () => {
      const p = { categoria: '', familia: '', unidade: '' };

      expect(erros(p)).toEqual([]);

      const dto = instancia(p);
      expect(dto.categoria).toBe('');
      expect(dto.familia).toBe('');
      expect(dto.unidade).toBe('');
    });

    it('`null` passa, e chega vazia — e nao `null` em coluna NOT NULL', () => {
      const p = { categoria: null, familia: null, unidade: null };

      expect(erros(p)).toEqual([]);

      const dto = instancia(p);
      expect(dto.categoria).toBe('');
      expect(dto.familia).toBe('');
      expect(dto.unidade).toBe('');
    });

    /**
     * A TRAVA. Nasce verde de proposito.
     *
     * Ausente precisa chegar `undefined` para o use case preservar o que esta
     * gravado. No dia em que alguem puser `= ''` aqui para "ficar igual a
     * criacao", este teste cai — e e a unica coisa entre esse acerto aparente
     * e um PATCH parcial apagando a classificacao de 7.424 pecas.
     */
    it('ausente chega `undefined`, e NAO apaga o que esta gravado', () => {
      const dto = instancia({ valor_venda: 100 });

      expect(dto.categoria).toBeUndefined();
      expect(dto.familia).toBeUndefined();
      expect(dto.unidade).toBeUndefined();
    });

    it('e nenhum outro campo ganha valor sozinho', () => {
      const dto = instancia({ categoria: '' });

      expect(dto.valor_custo).toBeUndefined();
      expect(dto.descricao_etiqueta).toBeUndefined();
      expect(dto.ativo).toBeUndefined();
    });
  });

  describe('o que nao muda', () => {
    it('o campo preenchido continua chegando intacto', () => {
      const p = { categoria: 'JEWEL', familia: 'BRINCO', unidade: 'PC' };

      expect(erros(p)).toEqual([]);

      const dto = instancia(p);
      expect(dto.categoria).toBe('JEWEL');
      expect(dto.familia).toBe('BRINCO');
      expect(dto.unidade).toBe('PC');
    });

    it('o que NAO e texto continua sendo recusado, com o nome do campo', () => {
      // Afrouxar o obrigatorio nao e afrouxar o tipo.
      expect(erros({ categoria: 42 }).join(' ')).toContain('categoria');
      expect(erros({ familia: true }).join(' ')).toContain('familia');
    });

    it('o resto do DTO segue valendo', () => {
      expect(erros({ valor_venda: -1 }).join(' ')).toContain('valor_venda');
      expect(erros({ ativo: 'talvez' }).join(' ')).toContain('ativo');
    });
  });
});
