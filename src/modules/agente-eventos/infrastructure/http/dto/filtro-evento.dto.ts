import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NOMES_AGENTE } from '../../../domain/entities/enums';
import type { NomeAgente } from '../../../domain/entities/enums';

export class FiltroEventoDto {
  @IsOptional()
  @IsIn([...NOMES_AGENTE])
  agente?: NomeAgente;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_]*$/)
  tipoEvento?: string;

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsUUID()
  vendedoraId?: string;

  @IsOptional()
  @IsUUID()
  correlationId?: string;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}
