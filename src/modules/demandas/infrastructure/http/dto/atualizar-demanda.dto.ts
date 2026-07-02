import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { STATUS_DEMANDA, type StatusDemanda } from '../../../domain/entities/enums';

export class AtualizarDemandaDto {
  @IsOptional()
  @IsEnum(STATUS_DEMANDA)
  status?: StatusDemanda;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resposta?: string;
}
