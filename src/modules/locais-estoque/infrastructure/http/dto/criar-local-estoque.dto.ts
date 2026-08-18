import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';

export class CriarLocalEstoqueDto {
  // Codigo do cadastro no ERP Safira. String e nao numero: pode ter zero a
  // esquerda ("0001"), como nos demais cadastros vindos do ERP.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @SanitizeText()
  nome: string;
}
