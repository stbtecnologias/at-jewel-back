import { FormaPagamento } from './enums';

export interface PagamentoVendaProps {
  id?: string;
  vendaId?: string;
  formaPagamento: FormaPagamento;
  valor: number;
  parcelas?: number;
  valorParcela?: number | null;
  bandeira?: string | null;
  dataPagamento?: Date | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class PagamentoVenda {
  readonly id: string | undefined;
  readonly vendaId: string | undefined;
  readonly formaPagamento: FormaPagamento;
  readonly valor: number;
  readonly parcelas: number;
  readonly valorParcela: number | null;
  readonly bandeira: string | null;
  readonly dataPagamento: Date | null;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: PagamentoVendaProps) {
    this.id = props.id;
    this.vendaId = props.vendaId;
    this.formaPagamento = props.formaPagamento;
    this.valor = props.valor;
    this.parcelas = props.parcelas ?? 1;
    this.valorParcela = props.valorParcela ?? null;
    this.bandeira = props.bandeira ?? null;
    this.dataPagamento = props.dataPagamento ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: PagamentoVendaProps): PagamentoVenda {
    return new PagamentoVenda(props);
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      formaPagamento: this.formaPagamento,
      valor: this.valor,
      parcelas: this.parcelas,
      valorParcela: this.valorParcela,
      bandeira: this.bandeira,
      dataPagamento: this.dataPagamento,
    };
  }
}
