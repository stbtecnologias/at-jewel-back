import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  HigienizarTextoLivre,
  SanitizeJson,
} from '../../../../../shared/http/sanitize/sanitize-text.transform';
import {
  ESTADOS_CONVERSA,
  MOTIVACOES_COMPRA,
  NIVEIS_CONHECIMENTO,
  TIPOS_COMPRA,
  URGENCIAS,
} from '../../../domain/entities/enums';
import type {
  EstadoConversaAgente,
  MotivacaoCompra,
  NivelConhecimento,
  TipoCompra,
  UrgenciaCompra,
} from '../../../domain/entities/enums';

export class AtualizarPerfilClienteDto {
  @IsOptional()
  @IsIn([...ESTADOS_CONVERSA])
  estadoConversa?: EstadoConversaAgente;

  @IsOptional()
  @IsIn([...TIPOS_COMPRA, null] as unknown[])
  tipoCompra?: TipoCompra | null;

  @IsOptional()
  @IsIn([...URGENCIAS, null] as unknown[])
  urgencia?: UrgenciaCompra | null;

  @IsOptional()
  @IsDateString()
  dataPretendidaCompra?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ticketEstimado?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @HigienizarTextoLivre()
  intencaoCompra?: string | null;

  @IsOptional()
  @IsObject()
  @SanitizeJson(true)
  wishlist?: object | null;

  @IsOptional()
  @IsIn([...NIVEIS_CONHECIMENTO, null] as unknown[])
  nivelConhecimento?: NivelConhecimento | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vendedoraSugeridaCodigo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vendedoraAprovadaCodigo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @HigienizarTextoLivre()
  resumoTriagem?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @HigienizarTextoLivre()
  notasInternas?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @HigienizarTextoLivre()
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  scorePerfil?: number | null;

  @IsOptional()
  @IsIn([...MOTIVACOES_COMPRA, null] as unknown[])
  motivacaoCompra?: MotivacaoCompra | null;
}
