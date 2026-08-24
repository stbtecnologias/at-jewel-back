import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ETAPAS_ATENDIMENTO } from '../../../domain/ports/repositories/atendimento-repository.port';
import type { EtapaAtendimento } from '../../../domain/ports/repositories/atendimento-repository.port';
import { MAXIMO_POR_PAGINA } from '../../../application/use-cases/consultar-auditoria.use-case';

export class FiltroAuditoriaDto {
  @IsOptional()
  @IsUUID()
  vendedora_id?: string;

  /**
   * Parte do nome do cliente. E o que responde a pergunta que originou esta
   * tela: "o Thiago falou com a Luana?".
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cliente?: string;

  @IsOptional()
  @IsIn([...ETAPAS_ATENDIMENTO])
  etapa?: EtapaAtendimento;

  /** Janela sobre a ABERTURA do atendimento. */
  @IsOptional()
  @IsDateString()
  de?: string;

  @IsOptional()
  @IsDateString()
  ate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAXIMO_POR_PAGINA)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
