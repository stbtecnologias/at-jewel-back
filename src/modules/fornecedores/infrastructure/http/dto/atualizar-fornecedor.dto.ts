import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { TIPOS_PESSOA } from '../../../../clientes/domain/entities/enums';
import type { TipoPessoa } from '../../../../clientes/domain/entities/enums';

/**
 * PATCH /fornecedores/:id — atualizacao parcial.
 *
 * Todos os campos opcionais, `nome` inclusive. Campo ausente mantem o valor
 * atual; enviar `null` limpa. Documento, telefone e CEP aceitam mascara e sao
 * normalizados para digitos antes de gravar.
 */
export class AtualizarFornecedorDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idErpFornecedor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @SanitizeText()
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @SanitizeText()
  nomeFantasia?: string;

  @IsOptional()
  @IsIn([...TIPOS_PESSOA])
  tipoPessoa?: TipoPessoa;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cpfCnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  inscricaoEstadual?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @SanitizeText()
  logradouro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  numero?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @SanitizeText()
  complemento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @SanitizeText()
  bairro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @SanitizeText()
  cidade?: string;

  // UF. O use case aplica toUpperCase.
  @IsOptional()
  @IsString()
  @Length(2, 2)
  estado?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  cep?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @SanitizeText()
  observacao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
