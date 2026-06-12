import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SanitizeJson } from '../../../../../shared/http/sanitize/sanitize-text.transform';

export class MensagemDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(8000)
  content: string;
}

export class ContextoDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  aba?: string;

  // Dados que o front injeta no prompt (KPIs da aba aberta). Higienizados
  // recursivamente para nao carregar control chars / invisiveis ao LLM.
  @IsOptional()
  @SanitizeJson(true)
  dados?: unknown;
}

export class ChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MensagemDto)
  messages: MensagemDto[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ContextoDto)
  contexto?: ContextoDto;
}
