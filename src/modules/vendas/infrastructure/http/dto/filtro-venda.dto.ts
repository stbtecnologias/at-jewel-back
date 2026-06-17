import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { FORMAS_PAGAMENTO, STATUS_VENDA } from '../../../domain/entities/enums';
import type { FormaPagamento, StatusVenda } from '../../../domain/entities/enums';

export class FiltroVendaDto {
  // data_venda >= dataDe. ISO 8601.
  @IsOptional()
  @IsDateString()
  dataDe?: string;

  // data_venda <= dataAte. ISO 8601.
  @IsOptional()
  @IsDateString()
  dataAte?: string;

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsUUID()
  vendedoraId?: string;

  @IsOptional()
  @IsIn([...STATUS_VENDA])
  status?: StatusVenda;

  @IsOptional()
  @IsIn([...FORMAS_PAGAMENTO])
  formaPagamento?: FormaPagamento;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
