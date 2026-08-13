/**
 * Empresa do grupo A.T. Jewel — cadastro criado na migracao 27, a partir do
 * levantamento da integracao do ERP Safira (reuniao de 11/08/2026).
 *
 * O QUE E UMA "EMPRESA" AQUI: o grupo opera N empresas dentro do mesmo ERP,
 * compartilhando o MESMO cadastro de produtos. Nao sao necessariamente filiais
 * — Alessandro descreveu que uma trabalha joias e outra trabalha outro
 * segmento. O mesmo anel pode existir na empresa 1 e na 5, com estoques
 * separados. Todas pertencem ao mesmo dono: "esta dentro do universo dela".
 *
 * Nao confundir com fornecedor (terceiro externo) nem com cliente.
 *
 * MINIMA DE PROPOSITO: Alessandro foi perguntado se havia algo relevante alem
 * do nome e respondeu que nao. Acrescentar coluna depois e um ALTER aditivo;
 * inventar campo que o ERP nao envia cria coluna morta.
 *
 * DUVIDA EM ABERTO, levantada em 13/08: a base de producao mostra os segmentos
 * em `produtos.categoria` — JEWEL (2119), HOME (218), AT WEAR (99). Esses
 * mesmos nomes batem com os estoques que a Fabricia criou no ERP. Ou seja, e
 * possivel que o corte de segmento seja por LOCAL DE ESTOQUE, e nao por
 * empresa — e ai esta tabela tera bem poucas linhas. Nao invalida o cadastro,
 * mas muda a expectativa. Pendente de confirmacao com o Alessandro.
 */
export interface EmpresaProps {
  id?: string;
  codigoErp?: string | null;
  nome: string;
  ativo: boolean;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class Empresa {
  readonly id: string | undefined;
  readonly codigoErp: string | null;
  readonly nome: string;
  readonly ativo: boolean;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: EmpresaProps) {
    this.id = props.id;
    this.codigoErp = props.codigoErp ?? null;
    this.nome = props.nome;
    this.ativo = props.ativo;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: EmpresaProps): Empresa {
    return new Empresa(props);
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      codigoErp: this.codigoErp,
      nome: this.nome,
      ativo: this.ativo,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
    };
  }
}
