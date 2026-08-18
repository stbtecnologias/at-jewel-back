import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';

export class CriarGrupoEstoqueDto {
  // ID do registro na tabela do ERP: chave tecnica, imutavel. E por ele que a
  // sincronizacao encontra o cadastro. O sufixo no nome do campo existe para
  // quem monta o payload saber de que tabela e o id.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idErpGrupo?: string;

  // Codigo do cadastro no ERP Safira. String e nao numero: pode ter zero a
  // esquerda ("0001"), como nos demais cadastros vindos do ERP.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @SanitizeText()
  nome: string;
}
