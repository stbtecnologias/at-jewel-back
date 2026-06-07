import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import {
  FORMAS_PAGAMENTO,
  STATUS_VENDA,
} from '../../../../vendas/domain/entities/enums';
import type {
  FormaPagamento,
  StatusVenda,
} from '../../../../vendas/domain/entities/enums';

// Teto defensivo para valores monetarios — alinhado ao DECIMAL(15,2) do
// schema 09 (evita overflow e payload absurdo na ingestao).
const VALOR_MAXIMO = 9_999_999_999_999;

// Payload do webhook /erp/vendas em snake_case (mesma convencao do
// erp-produto.dto.ts), validado pelo SafiraAuthGuard no controller.
export class ErpVendaItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigo_erp_item?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  produto_codigo_erp?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  quantidade: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valor_unitario: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valor_custo_unitario?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valor_desconto_item?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valor_total_item: number;
}

export class ErpVendaPagamentoDto {
  @IsIn([...FORMAS_PAGAMENTO])
  forma_pagamento: FormaPagamento;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valor: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(360)
  parcelas?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valor_parcela?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @SanitizeText()
  bandeira?: string;

  @IsOptional()
  @IsDateString()
  data_pagamento?: string;
}

export class ErpVendaDto {
  @IsUUID()
  @IsNotEmpty()
  evento_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  codigo_erp: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  cliente_codigo_erp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vendedora_codigo_erp?: string;

  @IsDateString()
  data_venda: string;

  @IsOptional()
  @IsDateString()
  data_contato?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valor_bruto: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valor_desconto?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(VALOR_MAXIMO)
  valor_total: number;

  @IsOptional()
  @IsIn([...STATUS_VENDA])
  status?: StatusVenda;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @SanitizeText()
  observacao?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ErpVendaItemDto)
  itens: ErpVendaItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ErpVendaPagamentoDto)
  pagamentos: ErpVendaPagamentoDto[];
}
