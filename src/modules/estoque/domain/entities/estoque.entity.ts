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
 * CONTRAPARTE: exatamente UMA de local, fornecedor, cliente ou vendedora. No
 * ERP essa dimensao e uma coluna de texto so, que guarda `Armario 01`, `Ana` e
 * `Fornecedor 1` misturados. Aqui cada uma e uma FK de verdade, e o invariante
 * de "exatamente uma" e garantido pelo CHECK `chk_estoque_local` — mas
 * tambem e validado aqui, para a chamada falhar com mensagem util antes de
 * chegar ao banco.
 */
export type LocalTipo = 'LOCAL' | 'FORNECEDOR' | 'CLIENTE' | 'VENDEDORA';

export interface EstoqueProps {
  id?: string;
  /** Identidade no ERP: chave da tabela LA, imutavel. Chave da sincronizacao. */
  idErp?: string | null;
  /** Codigo de NEGOCIO: a loja escolhe e pode trocar. Exibicao, nao identidade. */
  codigoErp?: string | null;
  empresaId: string;
  grupoEstoqueId: string;
  produtoId: string;
  localEstoqueId?: string | null;
  fornecedorId?: string | null;
  clienteId?: string | null;
  vendedoraId?: string | null;
  quantidade: number;
  /** Derivadas pelo banco (GENERATED). Nunca sao enviadas na escrita. */
  localTipo?: LocalTipo;
  localId?: string;
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
  readonly localEstoqueId: string | null;
  readonly fornecedorId: string | null;
  readonly clienteId: string | null;
  readonly vendedoraId: string | null;
  readonly quantidade: number;
  readonly localTipo: LocalTipo | undefined;
  readonly localId: string | undefined;
  readonly atualizadoEm: Date | undefined;
  readonly criadoEm: Date | undefined;

  private constructor(props: EstoqueProps) {
    this.id = props.id;
    this.idErp = props.idErp ?? null;
    this.codigoErp = props.codigoErp ?? null;
    this.empresaId = props.empresaId;
    this.grupoEstoqueId = props.grupoEstoqueId;
    this.produtoId = props.produtoId;
    this.localEstoqueId = props.localEstoqueId ?? null;
    this.fornecedorId = props.fornecedorId ?? null;
    this.clienteId = props.clienteId ?? null;
    this.vendedoraId = props.vendedoraId ?? null;
    this.quantidade = props.quantidade;
    this.localTipo = props.localTipo;
    this.localId = props.localId;
    this.atualizadoEm = props.atualizadoEm;
    this.criadoEm = props.criadoEm;
  }

  static create(props: EstoqueProps): Estoque {
    return new Estoque(props);
  }

  /**
   * Quantos locais vieram preenchidos. O invariante e "exatamente uma";
   * o chamador decide a excecao a lancar, porque a mensagem util depende do
   * contexto (criacao, atualizacao ou sincronizacao).
   */
  static contarLocais(props: {
    localEstoqueId?: string | null;
    fornecedorId?: string | null;
    clienteId?: string | null;
    vendedoraId?: string | null;
  }): number {
    return [
      props.localEstoqueId,
      props.fornecedorId,
      props.clienteId,
      props.vendedoraId,
    ].filter((v) => v !== null && v !== undefined && v !== '').length;
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
      fornecedorId: this.fornecedorId,
      clienteId: this.clienteId,
      vendedoraId: this.vendedoraId,
      localTipo: this.localTipo,
      localId: this.localId,
      quantidade: this.quantidade,
      atualizadoEm: this.atualizadoEm,
      criadoEm: this.criadoEm,
    };
  }
}
