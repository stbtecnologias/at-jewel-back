import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { TIPOS_VENDEDORA } from '../../../domain/entities/enums';
import type { TipoVendedora } from '../../../domain/entities/enums';

export class CriarVendedoraDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @SanitizeText()
  nome: string;

  @IsOptional()
  @IsIn([...TIPOS_VENDEDORA])
  tipo?: TipoVendedora;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @SanitizeText()
  especialidades?: string[];

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsappInterno?: string;

  @IsOptional()
  @IsUUID()
  adminUserId?: string;
}
