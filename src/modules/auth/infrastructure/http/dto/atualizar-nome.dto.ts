import { IsString, MaxLength, MinLength } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';

export class AtualizarNomeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @SanitizeText()
  nome: string;
}
