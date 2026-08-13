import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';

export class CriarEmpresaDto {
  // Codigo da empresa no ERP Safira. String e nao numero: pode ter zero a
  // esquerda ("0001"), como no exemplo que o Alessandro enviou.
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
