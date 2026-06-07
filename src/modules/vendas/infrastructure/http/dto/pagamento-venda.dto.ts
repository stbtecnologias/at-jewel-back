import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { FORMAS_PAGAMENTO } from '../../../domain/entities/enums';
import type { FormaPagamento } from '../../../domain/entities/enums';

const VALOR_MAXIMO = 9_999_999_999_999;

export class PagamentoVendaDto {
  @IsIn([...FORMAS_PAGAMENTO])
  formaPagamento: FormaPagamento;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valor: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(360)
  parcelas?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valorParcela?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @SanitizeText()
  bandeira?: string;

  @IsOptional()
  @IsDateString()
  dataPagamento?: string;
}
