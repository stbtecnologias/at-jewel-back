import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { ORIGENS_CONTATO, TABELAS_PRECO, TIPOS_PESSOA } from '../../../domain/entities/enums';
import type {
  OrigemContato,
  TabelaPreco,
  TipoPessoa,
} from '../../../domain/entities/enums';

export class CriarClienteDto {
  /**
   * Codigo do cliente no ERP. Opcional: o fluxo da Anastasia cria cliente que
   * nunca passou pelo Safira e portanto nao tem codigo.
   *
   * ACRESCENTADO EM 14/08/2026. Ate aqui so existia no PATCH, e quem importava
   * do ERP era obrigado a criar primeiro e gravar o codigo numa SEGUNDA
   * chamada. Se ela falhasse — rede, timeout, processo derrubado — sobrava
   * cliente sem codigo; e como nao havia codigo para casar, a proxima
   * sincronizacao criava OUTRO. Duplicata silenciosa, do tipo que so aparece
   * semanas depois. Mesma posicao e mesmas regras dos outros quatro cadastros.
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @SanitizeText()
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @SanitizeText()
  nomeFantasia?: string;

  @IsOptional()
  @IsIn([...TIPOS_PESSOA])
  tipoPessoa?: TipoPessoa;

  @IsOptional()
  @IsIn([...TABELAS_PRECO])
  tabelaPreco?: TabelaPreco;

  // Recebe em plaintext — o use case calcula o hash e o transformer cifra.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefone1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefone2?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  /**
   * WhatsApp e origem sao OPCIONAIS desde 12/08/2026.
   *
   * Eram obrigatorios porque a rota nasceu para o fluxo da Anastasia — cliente
   * novo aparece mandando mensagem. A integracao do ERP traz cliente que nunca
   * conversou, e muitos nem CPF tem.
   *
   * COM WhatsApp: nasce cadastro + perfil de triagem, como antes.
   * SEM WhatsApp: nasce so o cadastro. Perfil vazio ficaria em
   * TRIAGE_IN_PROGRESS e penduraria o cliente no funil sem ele ter falado com
   * ninguem.
   *
   * CONSEQUENCIA A SABER: cliente sem perfil e invisivel para
   * GET /clientes/lookup, que procura apenas em clientes_perfil.whatsapp_hash.
   * Se ele mandar mensagem depois, a Anastasia o trata como desconhecido e cria
   * um duplicado. A mitigacao (fallback do lookup para
   * clientes.telefone_1_hash) ficou como decisao a parte.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(20)
  whatsapp?: string;

  @IsOptional()
  @IsIn([...ORIGENS_CONTATO])
  origemContato?: OrigemContato;
}
