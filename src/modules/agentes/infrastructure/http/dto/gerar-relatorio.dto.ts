import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import type { TipoRelatorio } from '../../../application/use-cases/gerar-relatorio.use-case';

export class GerarRelatorioDto {
  @IsIn(['vendas', 'clientes'])
  tipo: TipoRelatorio;

  @IsOptional()
  @IsISO8601()
  data_inicio?: string;

  @IsOptional()
  @IsISO8601()
  data_fim?: string;
}
