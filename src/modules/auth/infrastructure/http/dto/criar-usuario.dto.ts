import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { AdminRole } from '../../../domain/entities/admin-user.entity';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';

export class CriarUsuarioDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @SanitizeText()
  nome?: string;

  // Papel dinamico — a existencia e validada no use case contra a tabela roles.
  @IsString()
  @MaxLength(40)
  role: AdminRole;

  /**
   * Celular, em qualquer formato: "(85) 9 8646-7241", "+55 85 98646-7241" ou
   * so digitos. O use case normaliza antes de gravar.
   *
   * Aceita 10 ou 11 digitos nacionais, com DDI 55 opcional, ignorando espacos,
   * parenteses, tracos e o sinal de mais. Validar formato aqui e barato; a
   * validacao que importa — duplicata considerando as formas equivalentes do
   * mesmo numero — fica no use case, porque depende do banco.
   */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  @Matches(/^\+?\s*(55)?[\s(-]*\d{2}[\s)-]*\d{4,5}[\s-]*\d{4}$/, {
    message: 'Telefone inválido. Use DDD + número, ex.: (99) 99999-9999',
  })
  telefone?: string;

  // Senha inicial opcional. Em branco = usuario entra somente via Google.
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  senha?: string;
}
