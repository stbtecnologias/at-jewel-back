import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { booleanoEntrada } from '../../../../../shared/erp/erp-transforms';

export class FiltroMovimentacaoDto {
  @IsOptional()
  @IsUUID()
  operacaoId?: string;

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsUUID()
  vendedoraId?: string;

  @IsOptional()
  @Transform(({ value }) => booleanoEntrada(value))
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsDateString()
  de?: string;

  @IsOptional()
  @IsDateString()
  ate?: string;

  // A fila da projecao: documento que ainda nao virou venda. Enquanto a
  // projecao nao existe, e a resposta a "o que ja chegou e ninguem usou?".
  @IsOptional()
  @Transform(({ value }) => booleanoEntrada(value))
  @IsBoolean()
  semVenda?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limite?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
