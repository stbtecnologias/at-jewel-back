import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import {
  FORMATOS_CATALOGO,
  STATUS_CATALOGO,
  TIPOS_REFERENCIA,
  type FormatoCatalogo,
  type StatusCatalogo,
  type TipoReferencia,
} from '../../../domain/entities/enums';

export class CriarCatalogoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @SanitizeText()
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @SanitizeText()
  tema?: string;

  @IsOptional()
  @IsEnum(FORMATOS_CATALOGO)
  formato?: FormatoCatalogo;
}

export class AtualizarCatalogoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @SanitizeText()
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @SanitizeText()
  tema?: string;

  @IsOptional()
  @IsEnum(FORMATOS_CATALOGO)
  formato?: FormatoCatalogo;

  @IsOptional()
  @IsEnum(STATUS_CATALOGO)
  status?: StatusCatalogo;
}

/** Referencia de TEXTO. Imagem entra por multipart, sem DTO de corpo. */
export class CriarReferenciaDto {
  @IsEnum(TIPOS_REFERENCIA)
  tipo: TipoReferencia;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @SanitizeText()
  valor: string;
}
