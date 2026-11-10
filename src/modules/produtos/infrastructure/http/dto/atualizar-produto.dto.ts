import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { vazioSeNulo } from '../../../../../shared/erp/erp-transforms';

export class AtualizarProdutoDto {
  @IsOptional()
  @IsString()
  id_erp_produto?: string;

  // ======================================================================
  // A CLASSIFICACAO QUE PODE CHEGAR VAZIA — 10/11/2026, a tarde.
  //
  // Eram `@IsOptional() @IsString() @IsNotEmpty()`, e o `@IsOptional()` so
  // desliga os outros validadores quando o valor e `null` ou `undefined`.
  // String vazia nao e nenhum dos dois, entao o `@IsNotEmpty()` rodava e
  // devolvia 400 — foi o que o integrador recebeu horas depois de a correcao
  // da criacao subir:
  //
  //   {"statusCode":400,"message":["categoria should not be empty"]}
  //
  // SEM INICIALIZADOR, ao contrario do `CriarProdutoDto`. Aqui o use case faz
  // atualizacao parcial por ausencia, entao chave ausente TEM de chegar
  // `undefined`; `= ''` faria todo PATCH parcial apagar a classificacao da
  // peca. O `vazioSeNulo` mexe so no `null`, e o teste do campo ausente em
  // `atualizar-sem-classificacao.spec.ts` existe para travar isso.
  // ======================================================================
  @Transform(({ value }) => vazioSeNulo(value))
  @IsOptional()
  @IsString()
  categoria?: string;

  @Transform(({ value }) => vazioSeNulo(value))
  @IsOptional()
  @IsString()
  familia?: string;

  @Transform(({ value }) => vazioSeNulo(value))
  @IsOptional()
  @IsString()
  unidade?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_venda?: number;

  @IsOptional()
  @IsString()
  colecao?: string;

  @IsOptional()
  @IsString()
  cor?: string;

  @IsOptional()
  @IsString()
  tamanho?: string;

  @IsOptional()
  @IsString()
  tipo_pedra?: string;

  @IsOptional()
  @IsString()
  colecao_pedra?: string;

  @IsOptional()
  @IsString()
  referencia_fornecedor?: string;

  @IsOptional()
  @IsString()
  descricao_etiqueta?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  peso_gramas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_compra?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_custo?: number;

  @IsOptional()
  @IsNumber()
  margem_percentual?: number;

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @IsString()
  foto_url?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
