import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { TIPOS_DEFEITO, type TipoDefeito } from '../../../domain/entities/enums';

export class CriarDefeitoDto {
  @IsUUID()
  produto_id: string;

  /**
   * De quem era a peca. OPCIONAL de proposito: peca que chega com defeito do
   * fornecedor, quebra na vitrine ou some no estoque nao passou por ninguem.
   * Exigir cliente obrigaria a inventar um.
   */
  @IsOptional()
  @IsUUID()
  cliente_id?: string;

  @IsEnum(TIPOS_DEFEITO)
  tipo: TipoDefeito;

  @IsString()
  descricao: string;

  @IsISO8601()
  data: string;

  @IsOptional()
  @IsString()
  resolucao?: string;
}
