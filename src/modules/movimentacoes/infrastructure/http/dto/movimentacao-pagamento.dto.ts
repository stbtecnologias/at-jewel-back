import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  booleanoEntrada,
  idErpEntrada,
} from '../../../../../shared/erp/erp-transforms';

const VALOR_MAXIMO = 9_999_999_999_999;

/**
 * Uma linha de `MovimentacaoPagamento` — uma PARCELA, nao "a forma de
 * pagamento da venda".
 *
 *   idErpPagamento        <- id_recf              (repete: NAO e identidade)
 *   idErpFormaPagamento   <- formas_pagamentoid
 *   valor                 <- valor
 *   debitoCredito         <- debcre
 *
 * `nParcela` NAO tem origem no ERP hoje — esta aqui esperando ele mandar. E a
 * ausencia dela que obriga a sincronizacao a substituir o agregado inteiro em
 * vez de casar linha a linha: sem numero de parcela, duas parcelas de valor
 * igual sao indistinguiveis.
 */
export class MovimentacaoPagamentoDto {
  @IsOptional()
  @Transform(({ value }) => idErpEntrada(value))
  @IsString()
  @MaxLength(50)
  idErpPagamento?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(360)
  nParcela?: number;

  @IsOptional()
  @Transform(({ value }) => idErpEntrada(value))
  @IsString()
  @MaxLength(50)
  idErpFormaPagamento?: string;

  // SEM @Min(0), pelo mesmo motivo do item: estorno e credito existem do lado
  // de la, e o sinal e informacao, nao erro.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-VALOR_MAXIMO)
  @Max(VALOR_MAXIMO)
  valor: number;

  // `debcre` veio 'D' em 100% das 28 linhas do dump. 'C' e aceito porque a
  // coluna existe do lado de la; o que ele significa para o saldo e pergunta
  // aberta com o Alessandro, e por isso o valor e guardado como veio, sem
  // inverter sinal.
  @IsOptional()
  @IsIn(['D', 'C'])
  debitoCredito?: 'D' | 'C';

  @IsOptional()
  @Transform(({ value }) => booleanoEntrada(value))
  @IsBoolean()
  ativo?: boolean;
}
