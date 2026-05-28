import { IsString, MaxLength, MinLength } from 'class-validator';

export class CriarApiKeyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;
}
