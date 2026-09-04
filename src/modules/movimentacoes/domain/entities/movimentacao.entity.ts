import { somarEmReais } from '../../../../shared/dinheiro/centavos';
import { MovimentacaoItem } from './movimentacao-item.entity';
import { MovimentacaoPagamento } from './movimentacao-pagamento.entity';

/**
 * Movimentacao do ERP Safira — o documento universal da integracao.
 *
 * Chegou em 03/09/2026 e respondeu a pergunta que o levantamento de 11/08
 * marcou como "a mais importante ficou em aberto e define tudo": o ERP manda
 * MOVIMENTO, nao saldo.
 *
 * E a mesma linha carrega DUAS coisas nossas. Alem de itens e pagamentos, todo
 * documento tem `grupoid_origem` e `grupoid_destino` — os grupos de estoque do
 * modelo acordado. Uma venda nao e so receita: e peca saindo de um grupo e
 * entrando em outro.
 *
 * ==========================================================================
 * ESTA ENTIDADE E ESPELHO, NAO REGRA.
 *
 * Ela nao valida soma, nao recusa valor e nao corrige sinal. O ERP e a fonte;
 * recusar o que ele manda so faria a movimentacao sumir sem ninguem ver — e o
 * defeito que ja existe em `/erp/vendas`, que grava FK nula, loga um warning e
 * devolve 200.
 *
 * As regras de negocio vivem na PROJECAO (`vendas`, `estoque`), que le daqui e
 * pode recusar em cima de um dado que ficou guardado. E a diferenca entre
 * "nao entendi este documento" e "perdi este documento".
 * ==========================================================================
 */
export interface MovimentacaoProps {
  id?: string;
  /** `iderpmovimentacao` normalizado. Identidade e chave de idempotencia. */
  idErp: string;
  numero?: number | null;
  dataMovimentacao: Date;

  operacaoId?: string | null;
  operacaoIdErp?: string | null;
  empresaId?: string | null;
  empresaIdErp?: string | null;
  grupoOrigemId?: string | null;
  grupoOrigemIdErp?: string | null;
  grupoDestinoId?: string | null;
  grupoDestinoIdErp?: string | null;

  entidadeOrigemIdErp?: string | null;
  entidadeDestinoIdErp?: string | null;
  clienteId?: string | null;
  clienteIdErp?: string | null;
  vendedoraId?: string | null;
  vendedoraIdErp?: string | null;

  valor: number;
  entrada?: boolean;
  saida?: boolean;
  ativo?: boolean;
  vendaId?: string | null;

  recebidoEm?: Date;
  criadoEm?: Date;
  atualizadoEm?: Date;

  itens: MovimentacaoItem[];
  pagamentos: MovimentacaoPagamento[];
}

export class Movimentacao {
  readonly id: string | undefined;
  readonly idErp: string;
  readonly numero: number | null;
  readonly dataMovimentacao: Date;

  readonly operacaoId: string | null;
  readonly operacaoIdErp: string | null;
  readonly empresaId: string | null;
  readonly empresaIdErp: string | null;
  readonly grupoOrigemId: string | null;
  readonly grupoOrigemIdErp: string | null;
  readonly grupoDestinoId: string | null;
  readonly grupoDestinoIdErp: string | null;

  readonly entidadeOrigemIdErp: string | null;
  readonly entidadeDestinoIdErp: string | null;
  readonly clienteId: string | null;
  readonly clienteIdErp: string | null;
  readonly vendedoraId: string | null;
  readonly vendedoraIdErp: string | null;

  readonly valor: number;
  readonly entrada: boolean;
  readonly saida: boolean;
  readonly ativo: boolean;
  readonly vendaId: string | null;

  readonly recebidoEm: Date | undefined;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  readonly itens: MovimentacaoItem[];
  readonly pagamentos: MovimentacaoPagamento[];

  private constructor(props: MovimentacaoProps) {
    this.id = props.id;
    this.idErp = props.idErp;
    this.numero = props.numero ?? null;
    this.dataMovimentacao = props.dataMovimentacao;

    this.operacaoId = props.operacaoId ?? null;
    this.operacaoIdErp = props.operacaoIdErp ?? null;
    this.empresaId = props.empresaId ?? null;
    this.empresaIdErp = props.empresaIdErp ?? null;
    this.grupoOrigemId = props.grupoOrigemId ?? null;
    this.grupoOrigemIdErp = props.grupoOrigemIdErp ?? null;
    this.grupoDestinoId = props.grupoDestinoId ?? null;
    this.grupoDestinoIdErp = props.grupoDestinoIdErp ?? null;

    this.entidadeOrigemIdErp = props.entidadeOrigemIdErp ?? null;
    this.entidadeDestinoIdErp = props.entidadeDestinoIdErp ?? null;
    this.clienteId = props.clienteId ?? null;
    this.clienteIdErp = props.clienteIdErp ?? null;
    this.vendedoraId = props.vendedoraId ?? null;
    this.vendedoraIdErp = props.vendedoraIdErp ?? null;

    this.valor = props.valor;
    this.entrada = props.entrada ?? false;
    this.saida = props.saida ?? false;
    this.ativo = props.ativo ?? true;
    this.vendaId = props.vendaId ?? null;

    this.recebidoEm = props.recebidoEm;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;

    this.itens = props.itens;
    this.pagamentos = props.pagamentos;
  }

  static create(props: MovimentacaoProps): Movimentacao {
    return new Movimentacao(props);
  }

  /**
   * Qual das duas pontas do documento e o TERCEIRO — o cliente, quando houver.
   *
   * O ERP poe a propria loja em uma das pontas e o terceiro na outra, e nao
   * marca qual e qual. O que diz e o sentido:
   *
   *   saida    a peca sai da casa   -> o terceiro esta no DESTINO   (venda)
   *   entrada  a peca volta         -> o terceiro esta na ORIGEM    (devolucao)
   *
   * Confere com as 24 movimentacoes do dump: em toda VEN a origem e a entidade
   * 9000000018 (a loja) e o destino e o cliente; em toda DVE, o inverso.
   *
   * POR QUE O SENTIDO, E NAO "a ponta que nao e 9000000018": porque aquele
   * numero e configuracao da instalacao dele, e chumba-lo aqui faria o codigo
   * quebrar em silencio no dia que a A.T. Jewel abrir outra empresa. O
   * `entrada`/`saida` vem no proprio documento.
   *
   * DEVOLVE `null` quando os dois flags estao ligados ou os dois desligados —
   * uma transferencia entre empresas, por exemplo, nao tem terceiro nenhum. E
   * a resposta honesta: sem sentido definido, adivinhar a ponta poria o codigo
   * de uma empresa do grupo no campo de cliente.
   *
   * O resultado e um CANDIDATO, nao uma afirmacao. Quem chama ainda tenta
   * resolve-lo contra `clientes` — e `cliente_id` so e preenchido se casar. O
   * id cru fica na coluna-sombra de qualquer jeito, que e o que permite religar
   * depois sem pedir o documento de novo.
   */
  static pontaDoTerceiro(props: {
    entrada: boolean;
    saida: boolean;
    entidadeOrigemIdErp?: string | null;
    entidadeDestinoIdErp?: string | null;
  }): string | null {
    if (props.saida === props.entrada) return null;
    return props.saida
      ? (props.entidadeDestinoIdErp ?? null)
      : (props.entidadeOrigemIdErp ?? null);
  }

  /**
   * Soma das linhas. Confere com `valor` nas 24 do dump — mas nao e imposta.
   *
   * Somada em CENTAVOS. Estes dois campos existem para serem COMPARADOS com o
   * `valor` — e a conferencia "o que chegou bate com o que saiu do ERP" —, e
   * igualdade sobre float com ruido da falso. Ver `shared/dinheiro/centavos`.
   */
  get totalDosItens(): number {
    return somarEmReais(this.itens.map((i) => i.total));
  }

  /** Soma do que ja foi recebido. Quase nunca igual a `valor`. */
  get totalDosPagamentos(): number {
    return somarEmReais(this.pagamentos.map((p) => p.valor));
  }

  toPublic(): Record<string, unknown> {
    return {
      ...this.toResumo(),
      entidadeOrigemIdErp: this.entidadeOrigemIdErp,
      entidadeDestinoIdErp: this.entidadeDestinoIdErp,
      grupoOrigemId: this.grupoOrigemId,
      grupoOrigemIdErp: this.grupoOrigemIdErp,
      grupoDestinoId: this.grupoDestinoId,
      grupoDestinoIdErp: this.grupoDestinoIdErp,
      empresaId: this.empresaId,
      empresaIdErp: this.empresaIdErp,
      clienteIdErp: this.clienteIdErp,
      vendedoraIdErp: this.vendedoraIdErp,
      totalDosItens: this.totalDosItens,
      totalDosPagamentos: this.totalDosPagamentos,
      itens: this.itens.map((i) => i.toPublic()),
      pagamentos: this.pagamentos.map((p) => p.toPublic()),
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
    };
  }

  /** Listagem: sem o agregado, que so e carregado no detalhe. */
  toResumo(): Record<string, unknown> {
    return {
      id: this.id,
      idErpMovimentacao: this.idErp,
      numero: this.numero,
      dataMovimentacao: this.dataMovimentacao,
      operacaoId: this.operacaoId,
      operacaoIdErp: this.operacaoIdErp,
      clienteId: this.clienteId,
      vendedoraId: this.vendedoraId,
      valor: this.valor,
      entrada: this.entrada,
      saida: this.saida,
      ativo: this.ativo,
      vendaId: this.vendaId,
      recebidoEm: this.recebidoEm,
    };
  }
}
