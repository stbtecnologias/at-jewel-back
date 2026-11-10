import { Transform } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { textoOuVazio } from '../../../../../shared/erp/erp-transforms';

export class CriarProdutoDto {
  // ID do registro na tabela do ERP: chave tecnica, imutavel. Segue o
  // snake_case do proprio modulo de produtos, com o sufixo da tabela.
  @IsOptional()
  @IsString()
  id_erp_produto?: string;

  @IsOptional()
  @IsString()
  codigo_erp?: string;

  // ======================================================================
  // CLASSIFICACAO QUE PODE NAO VIR — 10/11/2026.
  //
  // Eram `@IsNotEmpty()`, e isso recusou 75 produtos de um lote do ERP com
  // "categoria should not be empty". As pecas existem la; o cadastro e que
  // esta incompleto, e recusar nao preenchia nada — so as mantinha fora.
  //
  // Decisao do Lucas: aceitar como vier. Ausente vira string vazia, que e o
  // que o analytics ja procura. Ver `textoOuVazio`.
  // ======================================================================
  // O `= ''` E O CAMPO AUSENTE; o `@Transform` e o campo que vem `null`. Sao
  // dois caminhos diferentes: o transformador nao roda para chave que nao
  // existe no JSON, entao sem o valor inicial o campo chegaria `undefined` e o
  // `@IsString()` recusaria do mesmo jeito.
  @Transform(({ value }) => textoOuVazio(value))
  @IsString()
  categoria: string = '';

  @Transform(({ value }) => textoOuVazio(value))
  @IsString()
  familia: string = '';

  @Transform(({ value }) => textoOuVazio(value))
  @IsString()
  unidade: string = '';

  @IsNumber()
  @Min(0)
  valor_venda: number;

  @IsOptional()
  @IsString()
  colecao?: string;

  @IsOptional()
  @IsString()
  cor?: string;

  @IsOptional()
  @IsString()
  tamanho?: string;

  @IsOptional()
  @IsString()
  tipo_pedra?: string;

  @IsOptional()
  @IsString()
  colecao_pedra?: string;

  @IsOptional()
  @IsString()
  referencia_fornecedor?: string;

  @IsOptional()
  @IsString()
  descricao_etiqueta?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  peso_gramas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_compra?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_custo?: number;

  @IsOptional()
  @IsNumber()
  margem_percentual?: number;

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @IsString()
  foto_url?: string;

  /**
   * ACEITO E IGNORADO desde 17/09/2026. O saldo é a tabela `estoque`, que o
   * integrador alimenta por `/estoque`. O campo continua no contrato para quem
   * já o manda não passar a receber 400.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  estoque_atual?: number;

  @IsOptional()
  @IsISO8601()
  data_entrada_estoque?: string;
}
