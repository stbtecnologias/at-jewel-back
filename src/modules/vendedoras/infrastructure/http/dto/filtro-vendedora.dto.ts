import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { STATUS_DISPONIBILIDADE, TIPOS_VENDEDORA } from '../../../domain/entities/enums';
import type {
  StatusDisponibilidadeVendedora,
  TipoVendedora,
} from '../../../domain/entities/enums';

export class FiltroVendedoraDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsIn([...TIPOS_VENDEDORA])
  tipo?: TipoVendedora;

  @IsOptional()
  @IsIn([...STATUS_DISPONIBILIDADE])
  statusDisponibilidade?: StatusDisponibilidadeVendedora;

  @IsOptional()
  // Aceita "classico,noivado" ou array (?especialidades=a&especialidades=b)
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  especialidades?: string[];
}
