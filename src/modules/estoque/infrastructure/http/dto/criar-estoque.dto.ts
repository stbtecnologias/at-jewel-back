import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Corpo de POST /estoque e de PUT /estoque.
 *
 * Ate a migracao 57 havia quatro campos de local — `localEstoqueId`,
 * `fornecedorId`, `clienteId` e `vendedoraId` — e exatamente um devia vir
 * preenchido. O DTO nao conseguia expressar isso, entao a regra vivia no use
 * case, repetida em tres deles. Sobrou um campo so, obrigatorio: a regra passou
 * a caber no proprio DTO, e a validacao a mao saiu.
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

  // Onde a peca esta. Obrigatorio desde a 57 — o saldo mora sempre num local
  // nosso.
  @IsUUID()
  localEstoqueId: string;

  // SEM @Min(0): quantidade negativa e estado valido — e o que a casa deve
  // (partida dobrada do ERP). Ver a entidade de dominio.
  @IsInt()
  quantidade: number;
}
