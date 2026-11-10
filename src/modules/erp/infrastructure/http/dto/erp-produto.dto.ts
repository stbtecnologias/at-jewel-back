import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { textoOuVazio } from '../../../../../shared/erp/erp-transforms';

export class ErpProdutoDto {
  @IsUUID()
  @IsNotEmpty()
  evento_id: string;

  @IsString()
  @IsNotEmpty()
  codigo_erp: string;

  // A MESMA REGRA DA OUTRA PORTA — 10/11/2026. Ver `criar-produto.dto.ts`: o
  // ERP tem pecas sem classificacao, e recusa-las nao preenchia nada.
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
}
