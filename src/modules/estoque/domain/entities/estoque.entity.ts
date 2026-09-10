/**
 * Saldo de estoque — uma quantidade de um produto, de uma empresa, numa
 * situacao (grupo) e num local.
 *
 * Criado na migracao 32, a partir do modelo do ERP descrito pelo Lucas em
 * 17/08/2026.
 *
 * QUANTIDADE PODE SER NEGATIVA. O ERP lanca estoque em PARTIDA DOBRADA: ao
 * pegar uma peca consignada do fornecedor, +1 no nosso estoque (a peca esta
 * aqui) e -1 no fornecedor (devemos essa peca a ele). O negativo nao e erro, e
 * a obrigacao — por isso nao ha validacao de nao-negatividade nem aqui nem no
 * banco.
 *
 * ==========================================================================
 * O SALDO TEM UM DONO SO: UM LOCAL NOSSO. (migracao 57, 10/09/2026)
 *
 * Ate a 56 eram quatro donos possiveis, exatamente um por linha: local,
 * fornecedor, cliente ou vendedora. O integrador pediu para enviar so o local,
 * e as outras tres colunas foram apagadas.
 *
 * O QUE ISSO CUSTOU: a segunda perna da partida dobrada acima nao tem mais
 * onde morar — nao ha coluna para dizer A QUEM se deve. Negativo continua
 * valido e continua significando obrigacao; o que se perde e o destinatario.
 * Como remarcar isso ficou EM ABERTO com o integrador, e o caminho natural e o
 * GRUPO de estoque, que ja diz a situacao do saldo e ja tem `Consignado`.
 *
 * Sumiram junto `localTipo` e `localId`: eram GENERATED no banco e existiam so
 * para a UNIQUE composta pegar (tres das quatro colunas ficavam nulas, e no
 * Postgres nulos nunca colidem entre si). Com um dono so, seriam a constante
 * 'LOCAL' e uma copia do `localEstoqueId` — nao carregam informacao, e sairam
 * tambem da resposta da API.
 * ==========================================================================
 */
export interface EstoqueProps {
  id?: string;
  /** Identidade no ERP: chave da tabela LA, imutavel. Chave da sincronizacao. */
  idErp?: string | null;
  /** Codigo de NEGOCIO: a loja escolhe e pode trocar. Exibicao, nao identidade. */
  codigoErp?: string | null;
  empresaId: string;
  grupoEstoqueId: string;
  produtoId: string;
  /** Onde a peca esta. Obrigatorio desde a migracao 57. */
  localEstoqueId: string;
  quantidade: number;
  atualizadoEm?: Date;
  criadoEm?: Date;
}

export class Estoque {
  readonly id: string | undefined;
  readonly idErp: string | null;
  readonly codigoErp: string | null;
  readonly empresaId: string;
  readonly grupoEstoqueId: string;
  readonly produtoId: string;
  readonly localEstoqueId: string;
  readonly quantidade: number;
  readonly atualizadoEm: Date | undefined;
  readonly criadoEm: Date | undefined;

  private constructor(props: EstoqueProps) {
    this.id = props.id;
    this.idErp = props.idErp ?? null;
    this.codigoErp = props.codigoErp ?? null;
    this.empresaId = props.empresaId;
    this.grupoEstoqueId = props.grupoEstoqueId;
    this.produtoId = props.produtoId;
    this.localEstoqueId = props.localEstoqueId;
    this.quantidade = props.quantidade;
    this.atualizadoEm = props.atualizadoEm;
    this.criadoEm = props.criadoEm;
  }

  static create(props: EstoqueProps): Estoque {
    return new Estoque(props);
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      idErpEstoque: this.idErp,
      codigoErp: this.codigoErp,
      empresaId: this.empresaId,
      grupoEstoqueId: this.grupoEstoqueId,
      produtoId: this.produtoId,
      localEstoqueId: this.localEstoqueId,
      quantidade: this.quantidade,
      atualizadoEm: this.atualizadoEm,
      criadoEm: this.criadoEm,
    };
  }
}
