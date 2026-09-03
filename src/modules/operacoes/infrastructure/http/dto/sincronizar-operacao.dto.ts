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
 * Corpo de PUT /operacoes — o upsert da integracao, no padrao do
 * PUT /estoque.
 *
 * `idErpOperacao` e OBRIGATORIO aqui, ao contrario do POST: e a identidade que
 * decide entre criar e atualizar. Sem ela nao ha upsert, ha insercao repetida.
 */
export class SincronizarOperacaoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  idErpOperacao: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @SanitizeText()
  nome: string;

  // So vale na CRIACAO. Numa operacao que ja existe, o campo e IGNORADO — a
  // classificacao e nossa, e a ressincronizacao nao pode devolve-la para
  // OUTRA. Ver o cabecalho de SincronizarOperacaoUseCase.
  @IsOptional()
  @IsIn([...OPERACAO_CLASSES])
  classificacao?: OperacaoClasse;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
