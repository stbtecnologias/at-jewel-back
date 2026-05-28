import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { STATUS_DISPONIBILIDADE, TIPOS_VENDEDORA } from '../../../domain/entities/enums';
import type {
  StatusDisponibilidadeVendedora,
  TipoVendedora,
} from '../../../domain/entities/enums';

export class AtualizarVendedoraDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nome?: string;

  @IsOptional()
  @IsIn([...TIPOS_VENDEDORA])
  tipo?: TipoVendedora;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsIn([...STATUS_DISPONIBILIDADE])
  statusDisponibilidade?: StatusDisponibilidadeVendedora;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  especialidades?: string[];

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsappInterno?: string | null;

  @IsOptional()
  @IsUUID()
  adminUserId?: string | null;
}
