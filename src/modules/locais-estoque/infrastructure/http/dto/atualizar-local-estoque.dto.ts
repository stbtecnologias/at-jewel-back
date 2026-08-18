import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';

/** PATCH parcial: campo ausente mantem o valor atual. */
export class AtualizarLocalEstoqueDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idErpLocal?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @SanitizeText()
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
