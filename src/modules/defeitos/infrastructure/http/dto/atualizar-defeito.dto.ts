import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { TIPOS_DEFEITO, type TipoDefeito } from '../../../domain/entities/enums';

export class AtualizarDefeitoDto {
  @IsOptional()
  @IsUUID()
  produto_id?: string;

  /** `null` desvincula o cliente. Ausente nao mexe. */
  @IsOptional()
  @IsUUID()
  cliente_id?: string | null;

  @IsOptional()
  @IsEnum(TIPOS_DEFEITO)
  tipo?: TipoDefeito;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsISO8601()
  data?: string;

  @IsOptional()
  @IsString()
  resolucao?: string;
}
