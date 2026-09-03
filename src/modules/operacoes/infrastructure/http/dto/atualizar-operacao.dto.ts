import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { OPERACAO_CLASSES } from '../../../domain/entities/enums';
import type { OperacaoClasse } from '../../../domain/entities/enums';

/**
 * PATCH parcial. Campo ausente mantem o valor atual.
 *
 * O uso principal e `classificacao`: e por aqui que uma operacao que chegou do
 * ERP como OUTRA passa a valer alguma coisa. Reclassificar muda o que a
 * projecao faz com TODAS as movimentacoes daquela operacao — permitido de
 * proposito, mas nao e operacao inocente.
 */
export class AtualizarOperacaoDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idErpOperacao?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @SanitizeText()
  nome?: string;

  @IsOptional()
  @IsIn([...OPERACAO_CLASSES])
  classificacao?: OperacaoClasse;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
