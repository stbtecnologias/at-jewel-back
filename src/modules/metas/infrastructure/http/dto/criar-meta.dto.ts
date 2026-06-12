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

export class CriarMetaDto {
  @IsEnum(TIPOS_META)
  tipo: TipoMeta;

  // Obrigatorio quando tipo != GLOBAL (validado no dominio).
  @IsOptional()
  @IsUUID()
  referencia_id?: string;

  @IsNumber()
  @Min(0)
  valor_alvo: number;

  @IsISO8601()
  prazo: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}
