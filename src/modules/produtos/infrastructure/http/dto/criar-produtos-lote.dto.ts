import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CriarProdutoDto } from './criar-produto.dto';

export class CriarProdutosLoteDto {
  // Limite de 200 itens por request: alem de conter abuso, casa com o limite
  // de body de 100kb da API (main.ts). Para importacoes maiores, paginar.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CriarProdutoDto)
  produtos: CriarProdutoDto[];
}
