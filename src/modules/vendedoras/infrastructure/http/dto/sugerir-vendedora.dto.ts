import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';

// Teto de ticket compativel com o limite usado no modulo de vendas.
const TICKET_MAXIMO = 10_000_000;
const LIMIT_MAXIMO = 10;

/**
 * Entrada do roteamento de vendedora (S8). Recebida do agente (n8n) com os
 * dados de triagem ja extraidos. Todos os campos sao opcionais: o algoritmo
 * degrada graciosamente (sem clienteId nao avalia relacionamento; sem
 * especialidade nao avalia match; sem ticket usa fator neutro).
 *
 * NAO recebe PII de cliente (nome, telefone, conteudo de mensagens). So o
 * clienteId (UUID) para lookup interno de relacionamento previo.
 */
export class SugerirVendedoraDto {
  /** UUID do cliente, para checar relacionamento previo (atribuicao + historico). */
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  /** Tipo de joia/atendimento desejado. Casado com vendedora.especialidades. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @SanitizeText()
  especialidade?: string;

  /** Ticket estimado da triagem, para compatibilidade com o ticket medio. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(TICKET_MAXIMO)
  ticketEstimado?: number;

  /** Quantidade de sugestoes retornadas. Default 3, maximo 10. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMIT_MAXIMO)
  limit?: number;
}
