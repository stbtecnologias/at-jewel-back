import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { NOMES_AGENTE, type NomeAgente } from '../../../domain/entities/enums';
import { MensagemDto } from './chat.dto';

export class SalvarConversaDto {
  @IsIn(NOMES_AGENTE)
  agente: NomeAgente;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MensagemDto)
  mensagens: MensagemDto[];

  @IsOptional()
  @IsObject()
  contexto?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  cliente_id?: string;

  @IsOptional()
  @IsUUID()
  vendedora_id?: string;
}
