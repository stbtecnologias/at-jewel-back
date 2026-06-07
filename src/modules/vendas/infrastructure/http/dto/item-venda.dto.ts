import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Teto defensivo para valores monetarios — alinhado ao DECIMAL(15,2)
// do schema (evita overflow e payload absurdo na ingestao).
const VALOR_MAXIMO = 9_999_999_999_999;

export class ItemVendaDto {
  @IsOptional()
  @IsUUID()
  produtoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErpItem?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  quantidade: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valorUnitario: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valorCustoUnitario?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valorDescontoItem?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valorTotalItem: number;
}
