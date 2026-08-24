import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class FiltroProdutoDto {
  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  familia?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  ativo?: boolean;

  /**
   * Texto livre. O repositorio ja sabia buscar assim desde o catalogo da
   * vendedora — o que faltava era a porta HTTP deixar passar.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  /** Sem teto, uma busca vaga devolve o catalogo inteiro. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
