import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ADMIN_ROLES } from '../../../domain/entities/admin-user.entity';
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

  @IsIn(ADMIN_ROLES as readonly string[])
  role: AdminRole;

  // Senha inicial opcional. Em branco = usuario entra somente via Google.
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  senha?: string;
}
