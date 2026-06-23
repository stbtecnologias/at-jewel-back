import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';

export class AtualizarRoleDto {
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
  descricao?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  permissoes: string[];
}
