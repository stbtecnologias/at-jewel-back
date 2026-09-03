import { OperacaoClasse } from './enums';

/**
 * Operacao do ERP Safira — o cadastro que diz O QUE cada movimentacao e.
 *
 * Chegou em 03/09/2026 com duas linhas:
 *
 *   id_erp "009000000323"  codigo "VEN"  nome "VENDA"
 *   id_erp "009000000324"  codigo "DVE"  nome "DEVOLUCAO DE VENDA"
 *
 * Os tres campos do ERP tem papeis diferentes, e confundi-los e o erro que a
 * migracao 34 documentou em 18/08:
 *
 *   `idErp`      IDENTIDADE — a chave da tabela la, imutavel
 *   `codigoErp`  ATRIBUTO   — o codigo que a loja escolhe, e pode trocar
 *   `nome`       ATRIBUTO   — o rotulo dele
 *
 * `classificacao` e nossa. E o de-para entre o cadastro aberto do ERP e o
 * vocabulario fechado que o codigo entende — sem ele, cada operacao nova no
 * Safira viraria deploy, que e exatamente o argumento que criou
 * `formas_pagamento.classificacao` na migracao 28.
 */
export interface OperacaoProps {
  id?: string;
  idErp?: string | null;
  codigoErp?: string | null;
  nome: string;
  classificacao: OperacaoClasse;
  ativo: boolean;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class OperacaoEntity {
  readonly id: string | undefined;
  readonly idErp: string | null;
  readonly codigoErp: string | null;
  readonly nome: string;
  readonly classificacao: OperacaoClasse;
  readonly ativo: boolean;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: OperacaoProps) {
    this.id = props.id;
    this.idErp = props.idErp ?? null;
    this.codigoErp = props.codigoErp ?? null;
    this.nome = props.nome;
    this.classificacao = props.classificacao;
    this.ativo = props.ativo;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: OperacaoProps): OperacaoEntity {
    return new OperacaoEntity(props);
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      idErpOperacao: this.idErp,
      codigoErp: this.codigoErp,
      nome: this.nome,
      classificacao: this.classificacao,
      ativo: this.ativo,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
    };
  }
}
