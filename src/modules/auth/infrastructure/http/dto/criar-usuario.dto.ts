import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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

  // Senha inicial opcional. Em branco = usuario entra somente via Google.
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  senha?: string;
}
