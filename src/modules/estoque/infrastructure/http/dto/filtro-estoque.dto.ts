import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class FiltroEstoqueDto {
  @IsOptional()
  @IsUUID()
  empresaId?: string;

  @IsOptional()
  @IsUUID()
  grupoEstoqueId?: string;

  @IsOptional()
  @IsUUID()
  produtoId?: string;

  @IsOptional()
  @IsUUID()
  localEstoqueId?: string;

  /**
   * `?apenasNegativos=true` — o saldo negativo, que e o que a casa deve.
   *
   * Ate a migracao 57 dava para perguntar A QUEM, filtrando por fornecedor,
   * cliente ou vendedora. Nao da mais: o saldo tem um dono so, e o negativo
   * diz que se deve sem dizer a quem.
   */
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  apenasNegativos?: boolean;
}
