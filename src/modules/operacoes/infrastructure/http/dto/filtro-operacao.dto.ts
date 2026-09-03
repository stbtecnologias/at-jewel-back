import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { OPERACAO_CLASSES } from '../../../domain/entities/enums';
import type { OperacaoClasse } from '../../../domain/entities/enums';

export class FiltroOperacaoDto {
  // Query string chega como texto: 'true'/'false' viram boolean aqui.
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  ativo?: boolean;

  // `?classificacao=OUTRA` e a consulta que a tela existe para responder: o que
  // chegou do ERP e ainda ninguem disse o que e.
  @IsOptional()
  @IsIn([...OPERACAO_CLASSES])
  classificacao?: OperacaoClasse;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @SanitizeText()
  busca?: string;
}
