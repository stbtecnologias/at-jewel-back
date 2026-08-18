import { IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Corpo de POST /estoque e de PUT /estoque.
 *
 * Exatamente UMA das quatro contrapartes deve vir preenchida — o DTO nao tem
 * como expressar isso, entao a regra e validada no use case (mensagem util) e
 * garantida pelo CHECK do banco (ultima linha de defesa).
 */
export class CriarEstoqueDto {
  // Codigo da LINHA de saldo no ERP. Quando vem, e ele que identifica o
  // registro na sincronizacao — o integrador nao precisa conhecer nossos UUIDs
  // de linha, so os das quatro dimensoes.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  @IsUUID()
  empresaId: string;

  @IsUUID()
  grupoEstoqueId: string;

  @IsUUID()
  produtoId: string;

  @IsOptional()
  @IsUUID()
  localEstoqueId?: string;

  @IsOptional()
  @IsUUID()
  fornecedorId?: string;

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsUUID()
  vendedoraId?: string;

  // SEM @Min(0): quantidade negativa e estado valido — e o que a casa deve ao
  // fornecedor ou ao cliente (partida dobrada do ERP).
  @IsInt()
  quantidade: number;
}
