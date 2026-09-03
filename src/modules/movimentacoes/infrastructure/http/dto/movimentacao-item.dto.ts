import { Transform } from 'class-transformer';
import {
  IsBoolean,
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

// Teto defensivo alinhado ao DECIMAL(15,2) do schema — o mesmo de
// `ItemVendaDto`.
const VALOR_MAXIMO = 9_999_999_999_999;

/**
 * Uma linha de `MovimentacaoProduto`.
 *
 *   nItem          <- nitem
 *   idErpItem      <- id_mesti      (repete no documento: NAO e identidade)
 *   idErpProduto   <- produtoid
 *   quantidade     <- quantidade
 *   valorUnitario  <- unitario      (ja com desconto aplicado)
 */
export class MovimentacaoItemDto {
  // Parte da chave natural (movimentacao, nItem) — a unica que o ERP da para a
  // linha. Comeca em 1 no Safira.
  @IsInt()
  @Min(1)
  @Max(10_000)
  nItem: number;

  @IsOptional()
  @Transform(({ value }) => idErpEntrada(value))
  @IsString()
  @MaxLength(50)
  idErpItem?: string;

  @IsOptional()
  @Transform(({ value }) => idErpEntrada(value))
  @IsString()
  @MaxLength(50)
  idErpProduto?: string;

  // SEM @Min(0): devolucao e ajuste podem trazer quantidade negativa, e a
  // migracao 32 ja firmou que "quantidade negativa e estado valido" para o
  // estoque. Recusar aqui faria o documento sumir por causa de um sinal.
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(-VALOR_MAXIMO)
  @Max(VALOR_MAXIMO)
  quantidade: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-VALOR_MAXIMO)
  @Max(VALOR_MAXIMO)
  valorUnitario: number;

  @IsOptional()
  @Transform(({ value }) => booleanoEntrada(value))
  @IsBoolean()
  ativo?: boolean;
}
