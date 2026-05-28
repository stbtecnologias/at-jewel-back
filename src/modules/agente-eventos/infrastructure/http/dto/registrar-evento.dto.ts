import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { NOMES_AGENTE } from '../../../domain/entities/enums';
import type { NomeAgente } from '../../../domain/entities/enums';

export class RegistrarEventoDto {
  @IsIn([...NOMES_AGENTE])
  agente: NomeAgente;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  // Convencao: snake_case, ASCII, sem espacos.
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'tipoEvento deve estar em snake_case (ex: triagem_iniciada)',
  })
  tipoEvento: string;

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsUUID()
  vendedoraId?: string;

  @IsOptional()
  @IsUUID()
  correlationId?: string;

  @IsOptional()
  @IsObject()
  // ATENCAO: payload NAO pode conter PII. Use case valida via detectarPiiNoPayload.
  payload?: Record<string, unknown>;
}
