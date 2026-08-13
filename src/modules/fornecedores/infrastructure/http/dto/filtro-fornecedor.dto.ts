import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { TIPOS_PESSOA } from '../../../../clientes/domain/entities/enums';
import type { TipoPessoa } from '../../../../clientes/domain/entities/enums';

export class FiltroFornecedorDto {
  // Query string chega como texto: 'true'/'false' viram boolean aqui.
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsIn([...TIPOS_PESSOA])
  tipoPessoa?: TipoPessoa;

  /** Busca parcial em nome e nome fantasia. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @SanitizeText()
  busca?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @SanitizeText()
  cidade?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  estado?: string;
}
