import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ESTADOS_MONITORADOS_SLA } from '../../../domain/entities/enums';
import type { EstadoConversaAgente } from '../../../domain/entities/enums';

// Query do endpoint de monitoramento de SLA (consumido pela Sofia via n8n).
// `estado` so aceita os estados monitorados; `limit` tem teto de 500 para
// evitar resposta gigante caso a fila de atendimento esteja represada.
export class MonitoramentoSlaQueryDto {
  @IsOptional()
  @IsIn(ESTADOS_MONITORADOS_SLA as readonly string[])
  estado?: EstadoConversaAgente;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
