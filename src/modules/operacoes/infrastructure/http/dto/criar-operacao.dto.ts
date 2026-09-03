import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SanitizeText } from '../../../../../shared/http/sanitize/sanitize-text.transform';
import { OPERACAO_CLASSES } from '../../../domain/entities/enums';
import type { OperacaoClasse } from '../../../domain/entities/enums';

export class CriarOperacaoDto {
  // ID do registro na tabela do ERP: chave tecnica, imutavel. E por ele que a
  // sincronizacao encontra o cadastro. Sufixo no nome para saber de que tabela.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idErpOperacao?: string;

  // Codigo de NEGOCIO — "VEN", "DVE". Exibir e conferir, nao identidade.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoErp?: string;

  // Como o ERP chama: "VENDA", "DEVOLUCAO DE VENDA".
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @SanitizeText()
  nome: string;

  // OPCIONAL, ao contrario de `formas_pagamento.classificacao`, que e
  // obrigatoria. La o de-para pode ser deduzido do nome com seguranca ("PIX" e
  // pix). Aqui nao: o nome e frase livre do ERP, e classificar errado nao
  // deixa rastro — poe receita no lugar errado e o relatorio continua fechando.
  // Ausente, entra como OUTRA e fica inerte ate alguem dizer o que e.
  @IsOptional()
  @IsIn([...OPERACAO_CLASSES])
  classificacao?: OperacaoClasse;
}
