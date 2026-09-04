import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
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

  /**
   * Busca por parte do nome, para o seletor de cliente do painel. Combina com
   * os demais filtros em AND.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nome?: string;

  /**
   * Teto de resultados. ATE AGORA GET /clientes devolvia a base inteira —
   * com telefone, e-mail e limite de credito de cada um. Um seletor que
   * precisa de vinte nomes nao tem por que carregar isso tudo.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/**
 * Filtro da LISTAGEM DA TABELA — parente do de cima, com um teto muito maior.
 *
 * O teto de 200 do `FiltroClienteDto` existe porque cada linha do `GET
 * /clientes` carrega telefone, e-mail e limite de credito: era um seletor, e
 * seletor nao precisa da base inteira.
 *
 * A LISTAGEM DA TABELA NAO CARREGA NADA DISSO — devolve codigo, nome, nome
 * fantasia, situacao e a vendedora, e mais nada. Sem PII na resposta, o motivo
 * do teto baixo desaparece; o que sobra e o teto de tamanho de resposta, e por
 * isso ele existe mesmo assim.
 */
export class FiltroListagemClienteDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vendedoraCodigoErp?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;
}
