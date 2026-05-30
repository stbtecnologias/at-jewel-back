import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SCOPES_VALIDOS } from '../../../domain/entities/scopes';
import type { ApiKeyScope } from '../../../domain/entities/scopes';

export class CriarApiKeyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  // Lista de scopes que a chave recebe. Validamos contra SCOPES_VALIDOS
  // para impedir typos e scopes "fantasmas" que nunca serao reconhecidos
  // por @RequireScopes em runtime.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsIn([...SCOPES_VALIDOS], { each: true })
  scopes?: ApiKeyScope[];
}
