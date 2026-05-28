import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LookupClienteDto {
  // Recebido em plaintext na query string. O use case normaliza (so digitos)
  // e calcula o hash internamente. Nunca logar este valor em respostas/logs.
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(20)
  whatsapp: string;
}
