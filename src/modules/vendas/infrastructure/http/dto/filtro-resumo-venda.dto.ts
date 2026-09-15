import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { listaEntrada } from '../../../../../shared/http/query-transforms';
import { FORMAS_PAGAMENTO, STATUS_VENDA } from '../../../domain/entities/enums';
import type { FormaPagamento, StatusVenda } from '../../../domain/entities/enums';

// Filtros do resumo de vendas (big-numbers do dashboard). Todos opcionais.
//
// ESTE DTO SERVE DUAS ROTAS: `GET /vendas/resumo` e `GET /vendas/comparativo`.
// O comparativo le apenas `dataDe`/`dataAte` — ele e o ranking do periodo, e
// ja ignorava `status` e `vendedoraId` de proposito. `formaPagamento` entra na
// mesma condicao.
export class FiltroResumoVendaDto {
  // data_venda >= dataDe. ISO 8601.
  @IsOptional()
  @IsDateString()
  dataDe?: string;

  // data_venda <= dataAte. ISO 8601.
  @IsOptional()
  @IsDateString()
  dataAte?: string;

  /**
   * Aceita MAIS DE UM valor desde 10/09/2026 — pedido do Yerlon na revisao
   * de homologacao. O `listaEntrada` cobre as tres formas de envio; a antiga
   * (`?campo=x`, um valor so) continua valendo, entao o contrato ja publicado
   * nao quebra.
   */
  @IsOptional()
  @Transform(({ value }) => listaEntrada(value))
  @IsArray()
  @IsUUID(undefined, { each: true })
  vendedoraId?: string[];

  /**
   * Aceita MAIS DE UM valor desde 10/09/2026 — pedido do Yerlon na revisao
   * de homologacao. O `listaEntrada` cobre as tres formas de envio; a antiga
   * (`?campo=x`, um valor so) continua valendo, entao o contrato ja publicado
   * nao quebra.
   */
  @IsOptional()
  @Transform(({ value }) => listaEntrada(value))
  @IsArray()
  @IsIn([...STATUS_VENDA], { each: true })
  status?: StatusVenda[];

  /**
   * O MESMO filtro que `GET /vendas` ja aceitava, e que faltava aqui.
   *
   * A tela de Vendas manda o filtro inteiro para os dois endpoints. Sem este
   * campo, o `forbidNonWhitelisted` do ValidationPipe recusava a chamada com
   * "property formaPagamento should not exist" — e os big-numbers zeravam
   * enquanto a tabela abaixo, essa sim filtrada, mostrava as vendas em PIX.
   */
  @IsOptional()
  @Transform(({ value }) => listaEntrada(value))
  @IsArray()
  @IsIn([...FORMAS_PAGAMENTO], { each: true })
  formaPagamento?: FormaPagamento[];
}
