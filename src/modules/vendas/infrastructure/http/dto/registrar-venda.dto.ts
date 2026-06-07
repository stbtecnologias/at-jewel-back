import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { STATUS_VENDA } from '../../../domain/entities/enums';
import type { StatusVenda } from '../../../domain/entities/enums';
import { ItemVendaDto } from './item-venda.dto';
import { PagamentoVendaDto } from './pagamento-venda.dto';

const VALOR_MAXIMO = 9_999_999_999_999;

export class RegistrarVendaDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsUUID()
  vendedoraId?: string;

  @IsDateString()
  dataVenda: string;

  @IsOptional()
  @IsDateString()
  dataContato?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valorBruto: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valorDesconto?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valorTotal: number;

  @IsOptional()
  @IsIn([...STATUS_VENDA])
  status?: StatusVenda;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @SanitizeText()
  observacao?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ItemVendaDto)
  itens: ItemVendaDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PagamentoVendaDto)
  pagamentos: PagamentoVendaDto[];
}
