import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CriarProdutoDto {
  @IsOptional()
  @IsString()
  codigo_erp?: string;

  @IsString()
  @IsNotEmpty()
  categoria: string;

  @IsString()
  @IsNotEmpty()
  familia: string;

  @IsString()
  @IsNotEmpty()
  unidade: string;

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
