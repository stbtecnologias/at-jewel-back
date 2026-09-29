import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * ==========================================================================
 * NAO EXISTE FILTRO NEM ORDENACAO POR ESTOQUE OU CUSTO AQUI — E E DE PROPOSITO.
 *
 * O requisito RN-01(f) pede que a vendedora nao possa filtrar nem ordenar por
 * esses campos: ordenar por saldo entrega QUAIS pecas tem mais estoque mesmo
 * sem devolver o numero, e para essa pergunta a ordem responde tao bem quanto
 * o valor.
 *
 * Como o `ValidationPipe` global roda com `forbidNonWhitelisted`
 * (`main.ts:75`), qualquer parametro fora desta classe ja e recusado com 400 —
 * entao `?ordenar_por=estoque` nao passa, e nao ha guarda a escrever aqui.
 *
 * O QUE ISSO EXIGE DE QUEM MEXER: acrescentar ordenacao ou filtro de
 * estoque/custo nesta classe REABRE o buraco, e a validacao nao vai avisar.
 * Se for preciso um dia, o campo tem de nascer atras de `estoque:quantidade`
 * ou `produtos:custo`, checados no controller antes de chegar ao repositorio.
 *
 * (A tela de Produtos filtra por situacao de estoque no NAVEGADOR, sobre a
 * lista ja carregada. Sem o `estoqueAtual` no JSON aquele filtro perde a
 * materia-prima — ver `Produto.toPublic`.)
 * ==========================================================================
 */
export class FiltroProdutoDto {
  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  familia?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  ativo?: boolean;

  /**
   * Texto livre. O repositorio ja sabia buscar assim desde o catalogo da
   * vendedora — o que faltava era a porta HTTP deixar passar.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  busca?: string;

  /** Sem teto, uma busca vaga devolve o catalogo inteiro. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
