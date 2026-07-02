import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  STATUS_CONSIGNACAO,
  type StatusConsignacao,
} from '../../../domain/entities/enums';

export class AtualizarConsignacaoDto {
  @IsOptional()
  @IsEnum(STATUS_CONSIGNACAO)
  status?: StatusConsignacao;

  @IsOptional()
  @IsISO8601()
  dataRetorno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
