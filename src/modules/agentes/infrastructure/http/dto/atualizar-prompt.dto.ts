import { IsString, MaxLength, MinLength } from 'class-validator';

export class AtualizarPromptDto {
  @IsString()
  @MinLength(20)
  @MaxLength(20000)
  systemPrompt: string;
}
