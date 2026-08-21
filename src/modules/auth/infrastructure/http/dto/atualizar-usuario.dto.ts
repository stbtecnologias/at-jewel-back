import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';

export class AtualizarUsuarioDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @SanitizeText()
  nome?: string;

  /**
   * Aceita mascara, so digitos, ou VAZIO para apagar o telefone.
   *
   * O `ValidateIf` existe por causa do vazio: a regex de formato reprovaria
   * `''`, e apagar e uma operacao legitima — numero cadastrado errado precisa
   * poder sair. Campo ausente no corpo continua significando "nao mexe".
   */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  @ValidateIf((_, valor) => typeof valor === 'string' && valor.trim().length > 0)
  @Matches(/^\+?\s*(55)?[\s(-]*\d{2}[\s)-]*\d{4,5}[\s-]*\d{4}$/, {
    message: 'Telefone inválido. Use DDD + número, ex.: (85) 98646-7241',
  })
  telefone?: string;
}
