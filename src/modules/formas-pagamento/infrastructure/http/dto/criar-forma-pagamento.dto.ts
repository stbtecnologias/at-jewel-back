import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { FORMAS_PAGAMENTO } from '../../../../vendas/domain/entities/enums';
import type { FormaPagamento as ClassificacaoPagamento } from '../../../../vendas/domain/entities/enums';

export class CriarFormaPagamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  // Como o ERP chama o tipo: "Cartao de Credito", "PIX", "Boleto".
  // Parcelamento e bandeira NAO vem aqui — sao colunas de pagamentos_venda.
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @SanitizeText()
  nome: string;

  // Obrigatoria: e a ponte com o ENUM que pagamentos_venda ja usa e por onde
  // /analytics/distribuicao-pagamento agrupa. Sem ela o cadastro nao conversa
  // com o historico.
  @IsIn([...FORMAS_PAGAMENTO])
  classificacao: ClassificacaoPagamento;
}
