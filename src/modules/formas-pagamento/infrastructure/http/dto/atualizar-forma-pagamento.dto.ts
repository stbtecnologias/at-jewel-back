import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { FORMAS_PAGAMENTO } from '../../../../vendas/domain/entities/enums';
import type { FormaPagamento as ClassificacaoPagamento } from '../../../../vendas/domain/entities/enums';

/**
 * PATCH parcial. Campo ausente mantem o valor atual.
 *
 * Mudar `classificacao` reclassifica o historico no relatorio de distribuicao
 * por forma de pagamento — permitido de proposito (corrigir de-para errado da
 * ingestao exige isso), mas nao e operacao inocente.
 */
export class AtualizarFormaPagamentoDto {
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
  @IsIn([...FORMAS_PAGAMENTO])
  classificacao?: ClassificacaoPagamento;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
