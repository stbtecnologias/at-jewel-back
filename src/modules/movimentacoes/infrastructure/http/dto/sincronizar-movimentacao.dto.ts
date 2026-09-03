import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  booleanoEntrada,
  idErpEntrada,
} from '../../../../../shared/erp/erp-transforms';
import { MovimentacaoItemDto } from './movimentacao-item.dto';
import { MovimentacaoPagamentoDto } from './movimentacao-pagamento.dto';

const VALOR_MAXIMO = 9_999_999_999_999;

/**
 * Corpo de PUT /movimentacoes — a ingestao do documento do ERP.
 *
 * DE-PARA COM AS TABELAS DO SAFIRA:
 *
 *   idErpMovimentacao      <- Movimentacao.iderpmovimentacao  (ou id_mest)
 *   numero                 <- Movimentacao.numero
 *   dataMovimentacao       <- Movimentacao.data               (SEM FUSO)
 *   idErpOperacao          <- Movimentacao.operacaoid
 *   idErpEmpresa           <- Movimentacao.empresaid
 *   idErpGrupoOrigem       <- Movimentacao.grupoid_origem
 *   idErpGrupoDestino      <- Movimentacao.grupoid_destino
 *   idErpEntidadeOrigem    <- Movimentacao.entidadeidorigem
 *   idErpEntidadeDestino   <- Movimentacao.entidadeiddestino
 *   idErpVendedora         <- Movimentacao.vendedorid
 *   valor                  <- Movimentacao.valor
 *   entrada / saida        <- Movimentacao.entrada / .saida   (1.0 / 0.0)
 *   itens                  <- MovimentacaoProduto do documento
 *   pagamentos             <- MovimentacaoPagamento do documento
 *
 * NAO EXISTE `codigoErp` AQUI, e nao e esquecimento: o ERP nao da codigo de
 * negocio ao documento. O mais proximo e `numero`, que tem campo proprio e nao
 * e unico sozinho — vendas e devolucoes correm em sequencias separadas.
 *
 * `atualizadoem` do ERP tambem nao entra: vem '1899-12-30' em 100% das linhas,
 * que e o zero do Delphi. Aceitar um campo que nunca e preenchido so daria a
 * impressao de que ele serve para sincronizacao incremental.
 */
export class SincronizarMovimentacaoDto {
  // A identidade. Obrigatoria porque e a chave de idempotencia — sem ela o
  // reenvio duplicaria o documento em vez de atualiza-lo.
  @Transform(({ value }) => idErpEntrada(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  idErpMovimentacao: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  numero?: number;

  // Aceita ISO com ou sem fuso. Sem fuso, e lida como hora de parede da loja —
  // ver `dataDoErp`. O Safira manda sem.
  @IsDateString()
  dataMovimentacao: string;

  @IsOptional()
  @Transform(({ value }) => idErpEntrada(value))
  @IsString()
  @MaxLength(50)
  idErpOperacao?: string;

  @IsOptional()
  @Transform(({ value }) => idErpEntrada(value))
  @IsString()
  @MaxLength(50)
  idErpEmpresa?: string;

  @IsOptional()
  @Transform(({ value }) => idErpEntrada(value))
  @IsString()
  @MaxLength(50)
  idErpGrupoOrigem?: string;

  @IsOptional()
  @Transform(({ value }) => idErpEntrada(value))
  @IsString()
  @MaxLength(50)
  idErpGrupoDestino?: string;

  // As duas pontas do documento. Uma delas e a propria loja; qual e o terceiro
  // sai de `entrada`/`saida`, nao de comparar com um id chumbado aqui.
  @IsOptional()
  @Transform(({ value }) => idErpEntrada(value))
  @IsString()
  @MaxLength(50)
  idErpEntidadeOrigem?: string;

  @IsOptional()
  @Transform(({ value }) => idErpEntrada(value))
  @IsString()
  @MaxLength(50)
  idErpEntidadeDestino?: string;

  @IsOptional()
  @Transform(({ value }) => idErpEntrada(value))
  @IsString()
  @MaxLength(50)
  idErpVendedora?: string;

  // SEM @Min(0): documento de estorno pode vir negativo, e recusar por sinal
  // faria a movimentacao sumir.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-VALOR_MAXIMO)
  @Max(VALOR_MAXIMO)
  valor: number;

  @IsOptional()
  @Transform(({ value }) => booleanoEntrada(value))
  @IsBoolean()
  entrada?: boolean;

  @IsOptional()
  @Transform(({ value }) => booleanoEntrada(value))
  @IsBoolean()
  saida?: boolean;

  @IsOptional()
  @Transform(({ value }) => booleanoEntrada(value))
  @IsBoolean()
  ativo?: boolean;

  // SEM `ArrayMinSize(1)`, ao contrario de `RegistrarVendaDto`. La o minimo e
  // regra de negocio; aqui a tabela e espelho, e um documento sem linha e
  // informacao — inclusive a informacao de que algo esta errado do lado de la.
  // Recusar so o faria sumir.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MovimentacaoItemDto)
  itens?: MovimentacaoItemDto[];

  // Idem. Das 24 movimentacoes do dump, OITO nao tem pagamento nenhum: as 6
  // devolucoes e duas vendas (1311720 e 1323919). Exigir ao menos um recusaria
  // um terco do que o ERP manda.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MovimentacaoPagamentoDto)
  pagamentos?: MovimentacaoPagamentoDto[];
}
