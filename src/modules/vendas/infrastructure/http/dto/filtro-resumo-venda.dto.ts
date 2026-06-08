import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { STATUS_VENDA } from '../../../domain/entities/enums';
import type { StatusVenda } from '../../../domain/entities/enums';

// Filtros do resumo de vendas (big-numbers do dashboard). Todos opcionais.
export class FiltroResumoVendaDto {
  // data_venda >= dataDe. ISO 8601.
  @IsOptional()
  @IsDateString()
  dataDe?: string;

  // data_venda <= dataAte. ISO 8601.
  @IsOptional()
  @IsDateString()
  dataAte?: string;

  @IsOptional()
  @IsUUID()
  vendedoraId?: string;

  @IsOptional()
  @IsIn([...STATUS_VENDA])
  status?: StatusVenda;
}
