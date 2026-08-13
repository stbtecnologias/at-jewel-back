import { FormaPagamento as ClassificacaoPagamento } from '../../../vendas/domain/entities/enums';

/**
 * Forma de pagamento — cadastro criado na migracao 28, a partir do
 * levantamento da integracao do ERP Safira (reuniao de 11/08/2026).
 *
 * O CADASTRO E DE TIPOS, nao de condicoes:
 *
 *   `nome`          como o ERP chama: "Cartao de Credito", "PIX", "Boleto"
 *   `codigo_erp`    o identificador dele — a razao de ser desta tabela
 *   `classificacao` o ENUM `forma_pagamento` da migracao 09: dinheiro, pix,
 *                   cartao_credito, cartao_debito, transferencia, crediario,
 *                   cheque, outro
 *
 * PARCELAMENTO E BANDEIRA NAO MORAM AQUI. `pagamentos_venda` ja tem colunas
 * proprias para isso desde a migracao 09 — `parcelas`, `valor_parcela` e
 * `bandeira`. Uma venda "cartao Visa em 3x" se decompoe em
 * forma_pagamento=cartao_credito + bandeira='Visa' + parcelas=3, e o seed
 * confirma o uso (45 vendas em 8x, 44 em 6x, e assim por diante).
 *
 * O QUE ESTA TABELA ACRESCENTA ao ENUM que ja existia: o `codigo_erp`. E a
 * traducao entre o identificador do Safira e a nossa classificacao. Quando a
 * venda chegar dizendo `forma_pagamento_id: 12`, e esta linha que diz o que
 * gravar em `pagamentos_venda`. Sem ela, o de-para ficaria chumbado no codigo
 * e cada forma nova no ERP viraria deploy.
 *
 * A classificacao tambem e a ponte com o historico: /analytics/
 * distribuicao-pagamento agrupa por ela, e `pagamentos_venda` ja guarda esse
 * ENUM em 1.269 vendas. Sem ela, adotar o cadastro do ERP quebraria o
 * relatorio no mesmo dia.
 *
 * A CONFIRMAR COM O ALESSANDRO: o cadastro dele e so de tipos (leitura do
 * Lucas em 13/08, e o que a estrutura assume) ou inclui condicao de
 * parcelamento? E comum ERP separar "Cartao 3x" de "Cartao 6x" porque cada um
 * tem taxa e prazo de recebimento diferentes. A estrutura atende os dois
 * casos, mas o de-para da ingestao muda.
 *
 * ATENCAO AO MAPEAR: Alessandro trata PIX, TED e DOC como a mesma coisa ("no
 * frigir dos ovos vai cair do mesmo jeito"); o ENUM separa 'pix' de
 * 'transferencia'. O de-para precisa ser explicito na ingestao, senao a
 * distribuicao por forma de pagamento muda de leitura sem ninguem perceber.
 *
 * `pagamentos_venda.forma_pagamento` continua sendo o ENUM. Troca-lo por FK
 * para esta tabela e mudanca DESTRUTIVA e vai fatiada em cinco passos, com
 * deploys no meio — ver o cabecalho da migracao 28.
 */
export interface FormaPagamentoProps {
  id?: string;
  codigoErp?: string | null;
  nome: string;
  classificacao: ClassificacaoPagamento;
  ativo: boolean;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class FormaPagamentoEntity {
  readonly id: string | undefined;
  readonly codigoErp: string | null;
  readonly nome: string;
  readonly classificacao: ClassificacaoPagamento;
  readonly ativo: boolean;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: FormaPagamentoProps) {
    this.id = props.id;
    this.codigoErp = props.codigoErp ?? null;
    this.nome = props.nome;
    this.classificacao = props.classificacao;
    this.ativo = props.ativo;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: FormaPagamentoProps): FormaPagamentoEntity {
    return new FormaPagamentoEntity(props);
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      codigoErp: this.codigoErp,
      nome: this.nome,
      classificacao: this.classificacao,
      ativo: this.ativo,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
    };
  }
}
