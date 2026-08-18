import {
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
 * POST /fornecedores.
 *
 * Aceita documento, telefone e CEP COM ou SEM mascara — o use case normaliza
 * para digitos antes de gravar (ver migracao 26). Por isso os limites de
 * tamanho aqui sao folgados: `11.222.333/0001-44` tem 18 caracteres e vira 14.
 */
export class CriarFornecedorDto {
  // ID do registro na tabela do ERP: chave tecnica, imutavel. E por ele que a
  // sincronizacao encontra o cadastro. Sufixo no nome para saber de que tabela.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idErpFornecedor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @SanitizeText()
  nome: string;

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
}
