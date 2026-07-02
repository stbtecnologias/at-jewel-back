import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { TIPOS_DEMANDA, type TipoDemanda } from '../../../domain/entities/enums';

export class CriarDemandaDto {
  @IsEnum(TIPOS_DEMANDA)
  tipo: TipoDemanda;

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  @SanitizeText()
  descricao: string;
}
