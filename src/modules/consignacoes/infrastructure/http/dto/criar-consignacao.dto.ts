import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DESTINOS_CONSIGNACAO,
  type DestinoConsignacao,
} from '../../../domain/entities/enums';

export class CriarConsignacaoDto {
  @IsUUID()
  produtoId: string;

  @IsInt()
  @Min(1)
  quantidade: number;

  @IsEnum(DESTINOS_CONSIGNACAO)
  destinoTipo: DestinoConsignacao;

  // Coerencia com destinoTipo e validada no use case (regra cross-field).
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsUUID()
  vendedoraId?: string;

  @IsOptional()
  @IsISO8601()
  dataPrevistaRetorno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
