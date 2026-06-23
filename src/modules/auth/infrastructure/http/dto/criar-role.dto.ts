import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';

export class CriarRoleDto {
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{2,39}$/, {
    message: 'chave: 3-40 caracteres (A-Z, 0-9, _) comecando por letra',
  })
  chave: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @SanitizeText()
  nome: string;

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
