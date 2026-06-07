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
import { NOMES_AGENTE, TIPOS_EVENTO_VALIDOS } from '../../../domain/entities/enums';
import type { NomeAgente, TipoEventoAgente } from '../../../domain/entities/enums';

export class RegistrarEventoDto {
  @IsIn([...NOMES_AGENTE])
  agente: NomeAgente;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  // Allowlist (H-003): tipo deve pertencer ao conjunto previsto. Impede que
  // a deteccao de `suspeita_injection` da Sofia seja mascarada por tipos
  // arbitrarios. O @Matches permanece como defesa secundaria de formato.
  @IsIn([...TIPOS_EVENTO_VALIDOS], {
    message: 'tipoEvento nao pertence a allowlist de eventos do projeto',
  })
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'tipoEvento deve estar em snake_case (ex: triagem_iniciada)',
  })
  tipoEvento: TipoEventoAgente;

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
