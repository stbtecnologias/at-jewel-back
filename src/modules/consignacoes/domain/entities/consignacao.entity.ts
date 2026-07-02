import type { DestinoConsignacao, StatusConsignacao } from './enums';

export interface ConsignacaoProps {
  id?: string;
  produtoId: string;
  quantidade: number;
  destinoTipo: DestinoConsignacao;
  clienteId?: string | null;
  vendedoraId?: string | null;
  status?: StatusConsignacao;
  dataSaida?: Date;
  dataPrevistaRetorno?: Date | null;
  dataRetorno?: Date | null;
  observacao?: string | null;
  criadoPor?: string | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

// Entidade de dominio pura (sem TypeORM/NestJS). Concentra as
// invariantes da consignacao: quantidade positiva e coerencia
// entre destino_tipo e o id do detentor.
export class Consignacao {
  readonly id: string | undefined;
  readonly produtoId: string;
  readonly quantidade: number;
  readonly destinoTipo: DestinoConsignacao;
  readonly clienteId: string | null;
  readonly vendedoraId: string | null;
  readonly status: StatusConsignacao;
  readonly dataSaida: Date | undefined;
  readonly dataPrevistaRetorno: Date | null;
  readonly dataRetorno: Date | null;
  readonly observacao: string | null;
  readonly criadoPor: string | null;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: ConsignacaoProps) {
    this.id = props.id;
    this.produtoId = props.produtoId;
    this.quantidade = props.quantidade;
    this.destinoTipo = props.destinoTipo;
    this.clienteId = props.clienteId ?? null;
    this.vendedoraId = props.vendedoraId ?? null;
    this.status = props.status ?? 'ABERTA';
    this.dataSaida = props.dataSaida;
    this.dataPrevistaRetorno = props.dataPrevistaRetorno ?? null;
    this.dataRetorno = props.dataRetorno ?? null;
    this.observacao = props.observacao ?? null;
    this.criadoPor = props.criadoPor ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: ConsignacaoProps): Consignacao {
    if (!props.produtoId) {
      throw new Error('Consignacao exige produtoId');
    }
    if (!Number.isInteger(props.quantidade) || props.quantidade <= 0) {
      throw new Error('Consignacao exige quantidade inteira positiva');
    }
    Consignacao.validarDestino(props.destinoTipo, props.clienteId ?? null, props.vendedoraId ?? null);
    return new Consignacao(props);
  }

  // Coerencia destino <-> detentor. CLIENTE exige cliente_id e
  // proibe vendedora_id; VENDEDORA exige o inverso. Espelha o
  // CHECK chk_consignacao_destino da migracao 24.
  static validarDestino(
    destinoTipo: DestinoConsignacao,
    clienteId: string | null,
    vendedoraId: string | null,
  ): void {
    if (destinoTipo === 'CLIENTE') {
      if (!clienteId) {
        throw new Error('Destino CLIENTE exige clienteId');
      }
      if (vendedoraId) {
        throw new Error('Destino CLIENTE nao aceita vendedoraId');
      }
      return;
    }
    if (destinoTipo === 'VENDEDORA') {
      if (!vendedoraId) {
        throw new Error('Destino VENDEDORA exige vendedoraId');
      }
      if (clienteId) {
        throw new Error('Destino VENDEDORA nao aceita clienteId');
      }
      return;
    }
    throw new Error('destinoTipo invalido');
  }
}
