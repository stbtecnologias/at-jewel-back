import { IsInt } from 'class-validator';

/**
 * So a quantidade. Empresa, grupo, produto e local formam a IDENTIDADE
 * do saldo — trocar qualquer uma significa que o saldo e outro.
 */
export class AtualizarEstoqueDto {
  @IsInt()
  quantidade: number;
}
