import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TABELAS_PRECO } from '../../../domain/entities/enums';
import type { TabelaPreco } from '../../../domain/entities/enums';

export class FiltroClienteDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsIn([...TABELAS_PRECO])
  tabelaPreco?: TabelaPreco;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vendedoraCodigoErp?: string;
}
