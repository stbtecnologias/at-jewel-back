/**
 * Grupo de estoque — a SITUACAO em que um saldo se encontra.
 * Ex.: Disponivel · Consignado · Consignado_Cliente.
 *
 * Criado na migracao 32, a partir do modelo do ERP descrito pelo Lucas em
 * 17/08/2026: a chave do estoque e (empresa, grupo, local, produto).
 *
 * NAO CONFUNDIR COM `LocalEstoque`. O grupo diz em que SITUACAO o saldo esta;
 * o local diz ONDE ele esta. A estrutura das duas tabelas e identica, e isso
 * ja foi motivo para se cogitar unificar as duas num cadastro so com um
 * discriminador — descartado porque a FK deixaria de impedir que um local
 * fosse gravado na coluna de grupo, em silencio.
 *
 * MINIMO DE PROPOSITO: codigo do ERP, nome e ativo. O ERP nao envia mais nada;
 * inventar coluna aqui criaria campo morto.
 */
export interface GrupoEstoqueProps {
  id?: string;
  /** ID da linha no ERP: chave tecnica, imutavel. Identidade na sincronizacao. */
  idErp?: string | null;
  codigoErp?: string | null;
  nome: string;
  ativo: boolean;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class GrupoEstoque {
  readonly id: string | undefined;
  readonly idErp: string | null;
  readonly codigoErp: string | null;
  readonly nome: string;
  readonly ativo: boolean;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: GrupoEstoqueProps) {
    this.id = props.id;
    this.idErp = props.idErp ?? null;
    this.codigoErp = props.codigoErp ?? null;
    this.nome = props.nome;
    this.ativo = props.ativo;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: GrupoEstoqueProps): GrupoEstoque {
    return new GrupoEstoque(props);
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      // Exposto com o sufixo da tabela para quem integra saber a que
      // cadastro o id pertence ao montar o payload.
      idErpGrupo: this.idErp,
      codigoErp: this.codigoErp,
      nome: this.nome,
      ativo: this.ativo,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
    };
  }
}
