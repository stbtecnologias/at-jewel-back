import { IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Corpo de POST /estoque e de PUT /estoque.
 *
 * Exatamente UM dos quatro locais deve vir preenchido — o DTO nao tem
 * como expressar isso, entao a regra e validada no use case (mensagem util) e
 * garantida pelo CHECK do banco (ultima linha de defesa).
 */
export class CriarEstoqueDto {
  // ID da linha de saldo na tabela do ERP: chave tecnica, imutavel. E ele que
  // identifica o registro na sincronizacao — o integrador nao precisa conhecer
  // nossos UUIDs de linha. Sufixo no nome para saber de que tabela e o id.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idErpEstoque?: string;

  // Codigo de NEGOCIO: exibicao e conferencia, nao identidade.
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
