import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { TABELAS_PRECO, TIPOS_PESSOA } from '../../../domain/entities/enums';
import type { TabelaPreco, TipoPessoa } from '../../../domain/entities/enums';

/**
 * PATCH /clientes/:id — atualiza o CADASTRO.
 *
 * Nao confundir com AtualizarPerfilClienteDto, que mexe em `clientes_perfil`
 * (dados da triagem da Anastasia). Sao tabelas com donos diferentes.
 *
 * Todos os campos sao opcionais: PATCH parcial. Campo ausente mantem o valor
 * atual; enviar `null` limpa. O use case trata os dois casos separadamente
 * porque limpar telefone ou e-mail exige zerar tambem a coluna de hash — se
 * o hash antigo ficasse, o lookup continuaria encontrando o cliente por um
 * numero que ele nao tem mais.
 *
 * `whatsapp` NAO esta aqui: ele vive em `clientes_perfil` e se atualiza por
 * PATCH /clientes/:id/perfil.
 */
export class AtualizarClienteDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idErpCliente?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @SanitizeText()
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @SanitizeText()
  nomeFantasia?: string | null;

  @IsOptional()
  @IsIn([...TIPOS_PESSOA])
  tipoPessoa?: TipoPessoa;

  @IsOptional()
  @IsIn([...TABELAS_PRECO])
  tabelaPreco?: TabelaPreco;

  // Em plaintext. O use case normaliza (so digitos) antes de calcular o hash.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefone1?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefone2?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  limiteCredito?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @SanitizeText()
  observacaoGeral?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @SanitizeText()
  observacaoCredito?: string | null;

  // Resolve contra vendedoras.codigo_erp. Desde a migracao 29 ha FK: codigo
  // inexistente passa a violar constraint em vez de gravar em silencio.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vendedoraCodigoErp?: string | null;
}
