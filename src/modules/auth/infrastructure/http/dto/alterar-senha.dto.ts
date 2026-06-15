import { IsString, MaxLength, MinLength } from 'class-validator';

export class AlterarSenhaDto {
  @IsString()
  @MinLength(1)
  senha_atual: string;

  @IsString()
  @MinLength(8, { message: 'A nova senha deve ter ao menos 8 caracteres' })
  @MaxLength(128)
  nova_senha: string;
}
