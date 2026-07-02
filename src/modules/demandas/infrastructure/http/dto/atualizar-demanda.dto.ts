import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { STATUS_DEMANDA, type StatusDemanda } from '../../../domain/entities/enums';

export class AtualizarDemandaDto {
  @IsOptional()
  @IsEnum(STATUS_DEMANDA)
  status?: StatusDemanda;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @SanitizeText()
  resposta?: string;
}
