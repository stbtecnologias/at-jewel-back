import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ORIGENS_CONTATO, TABELAS_PRECO, TIPOS_PESSOA } from '../../../domain/entities/enums';
import type {
  OrigemContato,
  TabelaPreco,
  TipoPessoa,
} from '../../../domain/entities/enums';

export class CriarClienteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nomeFantasia?: string;

  @IsOptional()
  @IsIn([...TIPOS_PESSOA])
  tipoPessoa?: TipoPessoa;

  @IsOptional()
  @IsIn([...TABELAS_PRECO])
  tabelaPreco?: TabelaPreco;

  // Recebe em plaintext — o use case calcula o hash e o transformer cifra.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefone1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefone2?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  // WhatsApp e origem sao obrigatorios — cliente novo sempre chega por canal.
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(20)
  whatsapp: string;

  @IsIn([...ORIGENS_CONTATO])
  origemContato: OrigemContato;
}
