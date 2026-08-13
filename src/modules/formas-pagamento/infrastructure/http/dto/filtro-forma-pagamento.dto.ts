import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { FORMAS_PAGAMENTO } from '../../../../vendas/domain/entities/enums';
import type { FormaPagamento as ClassificacaoPagamento } from '../../../../vendas/domain/entities/enums';

export class FiltroFormaPagamentoDto {
  // Query string chega como texto: 'true'/'false' viram boolean aqui.
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsIn([...FORMAS_PAGAMENTO])
  classificacao?: ClassificacaoPagamento;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @SanitizeText()
  busca?: string;
}
