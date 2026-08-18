import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';

export class CriarEmpresaDto {
  // ID do registro na tabela do ERP: chave tecnica, imutavel. E por ele que a
  // sincronizacao encontra o cadastro. Sufixo no nome para saber de que tabela.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idErpEmpresa?: string;

  // Codigo da empresa no ERP Safira. String e nao numero: pode ter zero a
  // esquerda ("0001"), como no exemplo que o Alessandro enviou.
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
