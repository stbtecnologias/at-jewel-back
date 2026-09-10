import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { STATUS_DISPONIBILIDADE, TIPOS_VENDEDORA } from '../../../domain/entities/enums';
import type {
  StatusDisponibilidadeVendedora,
  TipoVendedora,
} from '../../../domain/entities/enums';

export class AtualizarVendedoraDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idErpVendedora?: string | null;

  /**
   * O codigo do ERP. So aceito para PREENCHER um vazio — ver o use case.
   *
   * Ele nao existia neste DTO ate 08/09/2026, e por um bom motivo: e a chave
   * que liga a vendedora a carteira dela. O que mudou foi passar a existir
   * vendedora cadastrada PELO CRM, que nasce sem codigo nenhum — e sem isto
   * ela nunca poderia receber o codigo real quando o ERP a trouxesse.
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @SanitizeText()
  nome?: string;

  @IsOptional()
  @IsIn([...TIPOS_VENDEDORA])
  tipo?: TipoVendedora;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsIn([...STATUS_DISPONIBILIDADE])
  statusDisponibilidade?: StatusDisponibilidadeVendedora;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @SanitizeText()
  especialidades?: string[];

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsappInterno?: string | null;

  /**
   * O numero CORPORATIVO — o chip da empresa. E o unico dos dois que o
   * sistema enxerga: pareado no painel, deixa a IA acompanhar o atendimento
   * sem a vendedora precisar contar nada. O interno e o celular pessoal
   * dela, e dele nao lemos nada.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsappExterno?: string | null;

  @IsOptional()
  @IsUUID()
  adminUserId?: string | null;
}
