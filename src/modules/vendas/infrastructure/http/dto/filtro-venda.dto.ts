import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { listaEntrada } from '../../../../../shared/http/query-transforms';
import { FORMAS_PAGAMENTO, STATUS_VENDA } from '../../../domain/entities/enums';
import type { FormaPagamento, StatusVenda } from '../../../domain/entities/enums';

export class FiltroVendaDto {
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
  clienteId?: string;

  /**
   * Aceita MAIS DE UM valor desde 10/09/2026 — pedido do Yerlon na revisao
   * de homologacao. O `listaEntrada` cobre as tres formas de envio; a antiga
   * (`?campo=x`, um valor so) continua valendo, entao o contrato ja publicado
   * nao quebra.
   */
  @IsOptional()
  @Transform(({ value }) => listaEntrada(value))
  @IsArray()
  @IsUUID(undefined, { each: true })
  vendedoraId?: string[];

  /**
   * Aceita MAIS DE UM valor desde 10/09/2026 — pedido do Yerlon na revisao
   * de homologacao. O `listaEntrada` cobre as tres formas de envio; a antiga
   * (`?campo=x`, um valor so) continua valendo, entao o contrato ja publicado
   * nao quebra.
   */
  @IsOptional()
  @Transform(({ value }) => listaEntrada(value))
  @IsArray()
  @IsIn([...STATUS_VENDA], { each: true })
  status?: StatusVenda[];

  /**
   * Aceita MAIS DE UM valor desde 10/09/2026 — pedido do Yerlon na revisao
   * de homologacao. O `listaEntrada` cobre as tres formas de envio; a antiga
   * (`?campo=x`, um valor so) continua valendo, entao o contrato ja publicado
   * nao quebra.
   */
  @IsOptional()
  @Transform(({ value }) => listaEntrada(value))
  @IsArray()
  @IsIn([...FORMAS_PAGAMENTO], { each: true })
  formaPagamento?: FormaPagamento[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
