import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
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

/**
 * A capa escolhida. `null` e um valor legitimo — significa "volta a
 * automatica", e nao "campo ausente"; por isso `@IsOptional` nao serve
 * sozinho, e o tipo admite null explicitamente.
 */
export class DefinirCapaDto {
  @IsOptional()
  @IsUUID()
  referencia_id?: string | null;
}

/**
 * A nota de um arquivo de referencia. String vazia e valida — e como se apaga.
 */
export class AnotarReferenciaDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @SanitizeText()
  observacao?: string | null;
}

/**
 * Correcao do parcelamento de uma peca. Os dois campos sao opcionais e `null`
 * e valor legitimo — significa "volta a nao ter", e nao "nao mexe".
 */
export class CorrigirParcelamentoDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  parcelas?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(300)
  juros_percentual?: number | null;
}
