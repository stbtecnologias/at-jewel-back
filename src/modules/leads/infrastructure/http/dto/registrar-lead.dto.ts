import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import type {
  OcasiaoLead,
  OrigemContato,
} from '../../../domain/ports/repositories/lead-repository.port';

const ORIGENS: OrigemContato[] = [
  'whatsapp',
  'instagram',
  'site',
  'indicacao',
  'loja_fisica',
  'outro',
];

const OCASIOES: OcasiaoLead[] = [
  'CASAMENTO',
  'NOIVADO',
  'ANIVERSARIO',
  'FORMATURA',
  'DATA_COMEMORATIVA',
  'AUTOPRESENTE',
  'OUTRO',
];

/**
 * Entrada da triagem, enviada pelo `atwpp` a cada mensagem relevante.
 *
 * So o `whatsapp` e obrigatorio: e a identidade da conversa, e tudo o mais a
 * Anastasia descobre ao longo do dialogo. Um POST com apenas o numero e
 * legitimo — e o que acontece na primeira mensagem.
 *
 * Todo texto passa por `SanitizeText`. O conteudo aqui vem de uma conversa com
 * o publico, entao chega como for.
 */
export class RegistrarLeadDto {
  /** Numero em plaintext, com ou sem formatacao. Normalizado no use case. */
  @IsString()
  @MinLength(8)
  @MaxLength(30)
  whatsapp: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @SanitizeText()
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @SanitizeText()
  apelido?: string;

  @IsOptional()
  @IsIn(ORIGENS)
  origemContato?: OrigemContato;

  @IsOptional()
  @IsIn(OCASIOES)
  ocasiao?: OcasiaoLead;

  /** Texto livre: "alianca de ouro branco, par". A vendedora e quem le. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @SanitizeText()
  produtosDesejados?: string;

  /** O que a Anastasia entendeu da conversa. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @SanitizeText()
  resumoTriagem?: string;

  /** Codigo da vendedora que POST /vendedoras/sugerir ranqueou em primeiro. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @SanitizeText()
  vendedoraSugeridaCodigo?: string;

  /**
   * A triagem terminou. Quem leu a conversa inteira e quem sabe — melhor que
   * uma regra do tipo "se ocasiao e produto estiverem preenchidos".
   */
  @IsOptional()
  @IsBoolean()
  prontoParaEncaminhar?: boolean;
}
