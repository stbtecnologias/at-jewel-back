import { StatusVenda } from './enums';
import { ItemVenda } from './item-venda.entity';
import { PagamentoVenda } from './pagamento-venda.entity';

// Erro de dominio para violacao de invariante de venda. A camada de
// aplicacao traduz isto para o erro HTTP apropriado (BadRequest), sem
// vazar detalhes monetarios no log.
export class VendaInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VendaInvalidaError';
  }
}

// Comparacao monetaria em centavos para evitar drift de ponto flutuante
// (0.1 + 0.2 !== 0.3). Tolerancia de 1 centavo absorve arredondamentos
// legitimos do ERP. Vive no dominio porque e regra de negocio de venda,
// compartilhada pelo registro manual e pela ingestao via ERP.
const TOLERANCIA_CENTAVOS = 1;

function paraCentavos(valor: number): number {
  return Math.round(valor * 100);
}

export interface VendaProps {
  id?: string;
  codigoErp?: string | null;
  clienteId?: string | null;
  vendedoraId?: string | null;
  dataVenda: Date;
  dataContato?: Date | null;
  valorBruto: number;
  valorDesconto?: number;
  valorTotal: number;
  status?: StatusVenda;
  observacao?: string | null;
  ativo?: boolean;
  itens?: ItemVenda[];
  pagamentos?: PagamentoVenda[];
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class Venda {
  readonly id: string | undefined;
  readonly codigoErp: string | null;
  readonly clienteId: string | null;
  readonly vendedoraId: string | null;
  readonly dataVenda: Date;
  readonly dataContato: Date | null;
  readonly valorBruto: number;
  readonly valorDesconto: number;
  readonly valorTotal: number;
  readonly status: StatusVenda;
  readonly observacao: string | null;
  readonly ativo: boolean;
  readonly itens: ItemVenda[];
  readonly pagamentos: PagamentoVenda[];
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: VendaProps) {
    this.id = props.id;
    this.codigoErp = props.codigoErp ?? null;
    this.clienteId = props.clienteId ?? null;
    this.vendedoraId = props.vendedoraId ?? null;
    this.dataVenda = props.dataVenda;
    this.dataContato = props.dataContato ?? null;
    this.valorBruto = props.valorBruto;
    this.valorDesconto = props.valorDesconto ?? 0;
    this.valorTotal = props.valorTotal;
    this.status = props.status ?? 'concluida';
    this.observacao = props.observacao ?? null;
    this.ativo = props.ativo ?? true;
    this.itens = props.itens ?? [];
    this.pagamentos = props.pagamentos ?? [];
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: VendaProps): Venda {
    return new Venda(props);
  }

  // Valida as invariantes monetarias e estruturais do agregado de venda.
  // Regra unica compartilhada pelo registro manual (RegistrarVendaUseCase) e
  // pela ingestao via ERP (RegistrarVendaViaErpUseCase) para nao divergir.
  //
  // Lanca VendaInvalidaError quando:
  //  - nao ha ao menos um item;
  //  - nao ha ao menos um pagamento;
  //  - valor_total != valor_bruto - valor_desconto (tolerancia 1 centavo);
  //  - soma dos pagamentos != valor_total (tolerancia 1 centavo).
  validarInvariantes(): void {
    if (this.itens.length === 0) {
      throw new VendaInvalidaError('Venda deve ter ao menos um item');
    }
    if (this.pagamentos.length === 0) {
      throw new VendaInvalidaError('Venda deve ter ao menos um pagamento');
    }

    const totalEsperado =
      paraCentavos(this.valorBruto) - paraCentavos(this.valorDesconto);
    if (
      Math.abs(paraCentavos(this.valorTotal) - totalEsperado) >
      TOLERANCIA_CENTAVOS
    ) {
      throw new VendaInvalidaError(
        'valor_total nao confere com valor_bruto - valor_desconto',
      );
    }

    const somaPagamentos = this.pagamentos.reduce(
      (acc, p) => acc + paraCentavos(p.valor),
      0,
    );
    if (
      Math.abs(somaPagamentos - paraCentavos(this.valorTotal)) >
      TOLERANCIA_CENTAVOS
    ) {
      throw new VendaInvalidaError(
        'Soma dos pagamentos nao confere com valor_total da venda',
      );
    }
  }

  // Serializacao para resposta administrativa. Sem PII (apenas FKs
  // de cliente/vendedora). Inclui o agregado completo de itens e
  // pagamentos quando carregado.
  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      codigoErp: this.codigoErp,
      clienteId: this.clienteId,
      vendedoraId: this.vendedoraId,
      dataVenda: this.dataVenda,
      dataContato: this.dataContato,
      valorBruto: this.valorBruto,
      valorDesconto: this.valorDesconto,
      valorTotal: this.valorTotal,
      status: this.status,
      observacao: this.observacao,
      ativo: this.ativo,
      itens: this.itens.map((i) => i.toPublic()),
      pagamentos: this.pagamentos.map((p) => p.toPublic()),
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
    };
  }

  // Serializacao reduzida para listagem (sem o agregado de itens e
  // pagamentos, que so e carregado no detalhe).
  toResumo(): Record<string, unknown> {
    return {
      id: this.id,
      codigoErp: this.codigoErp,
      clienteId: this.clienteId,
      vendedoraId: this.vendedoraId,
      dataVenda: this.dataVenda,
      dataContato: this.dataContato,
      valorBruto: this.valorBruto,
      valorDesconto: this.valorDesconto,
      valorTotal: this.valorTotal,
      status: this.status,
      ativo: this.ativo,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
    };
  }
}
