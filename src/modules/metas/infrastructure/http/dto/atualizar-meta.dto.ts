import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TIPOS_META, type TipoMeta } from '../../../domain/entities/enums';

export class AtualizarMetaDto {
  @IsOptional()
  @IsEnum(TIPOS_META)
  tipo?: TipoMeta;

  @IsOptional()
  @IsUUID()
  referencia_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_alvo?: number;

  @IsOptional()
  @IsISO8601()
  prazo?: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}
