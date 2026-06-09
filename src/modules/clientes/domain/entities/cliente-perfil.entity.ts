import {
  EstadoConversaAgente,
  MotivacaoCompra,
  NivelConhecimento,
  OrigemContato,
  TipoCompra,
  UrgenciaCompra,
} from './enums';

export interface ClientePerfilProps {
  clienteId: string;
  whatsapp?: string | null;
  whatsappHash?: string | null;
  origemContato?: OrigemContato | null;
  estadoConversa: EstadoConversaAgente;
  estadoAtualizadoEm?: Date;
  tipoCompra?: TipoCompra | null;
  urgencia?: UrgenciaCompra | null;
  dataPretendidaCompra?: Date | null;
  ticketEstimado?: number | null;
  intencaoCompra?: string | null;
  wishlist?: object | null;
  nivelConhecimento?: NivelConhecimento | null;
  vendedoraSugeridaCodigo?: string | null;
  vendedoraAprovadaCodigo?: string | null;
  resumoTriagem?: string | null;
  notasInternas?: string | null;
  tags?: string[];
  scorePerfil?: number | null;
  motivacaoCompra?: MotivacaoCompra | null;
  primeiroContatoEm?: Date | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class ClientePerfil {
  readonly clienteId: string;

  // Descriptografado pela camada de infraestrutura. Hash so para lookup.
  readonly whatsapp: string | null;
  readonly whatsappHash: string | null;

  readonly origemContato: OrigemContato | null;
  readonly estadoConversa: EstadoConversaAgente;
  readonly estadoAtualizadoEm: Date | undefined;

  readonly tipoCompra: TipoCompra | null;
  readonly urgencia: UrgenciaCompra | null;
  readonly dataPretendidaCompra: Date | null;
  readonly ticketEstimado: number | null;

  readonly intencaoCompra: string | null;
  readonly wishlist: object | null;

  readonly nivelConhecimento: NivelConhecimento | null;
  readonly vendedoraSugeridaCodigo: string | null;
  readonly vendedoraAprovadaCodigo: string | null;
  readonly resumoTriagem: string | null;
  readonly notasInternas: string | null;

  readonly tags: string[];
  readonly scorePerfil: number | null;
  readonly motivacaoCompra: MotivacaoCompra | null;

  // Marca quando a vendedora fez o primeiro contato apos o handoff. Para o
  // cronometro do SLA de primeiro contato. null = ainda nao contatado.
  readonly primeiroContatoEm: Date | null;

  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: ClientePerfilProps) {
    this.clienteId = props.clienteId;
    this.whatsapp = props.whatsapp ?? null;
    this.whatsappHash = props.whatsappHash ?? null;
    this.origemContato = props.origemContato ?? null;
    this.estadoConversa = props.estadoConversa;
    this.estadoAtualizadoEm = props.estadoAtualizadoEm;
    this.tipoCompra = props.tipoCompra ?? null;
    this.urgencia = props.urgencia ?? null;
    this.dataPretendidaCompra = props.dataPretendidaCompra ?? null;
    this.ticketEstimado = props.ticketEstimado ?? null;
    this.intencaoCompra = props.intencaoCompra ?? null;
    this.wishlist = props.wishlist ?? null;
    this.nivelConhecimento = props.nivelConhecimento ?? null;
    this.vendedoraSugeridaCodigo = props.vendedoraSugeridaCodigo ?? null;
    this.vendedoraAprovadaCodigo = props.vendedoraAprovadaCodigo ?? null;
    this.resumoTriagem = props.resumoTriagem ?? null;
    this.notasInternas = props.notasInternas ?? null;
    this.tags = props.tags ?? [];
    this.scorePerfil = props.scorePerfil ?? null;
    this.motivacaoCompra = props.motivacaoCompra ?? null;
    this.primeiroContatoEm = props.primeiroContatoEm ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: ClientePerfilProps): ClientePerfil {
    return new ClientePerfil(props);
  }

  /**
   * View para monitoramento de SLA pela Sofia (agente gerencial via n8n).
   * Contem APENAS metadados de estado de atendimento — ZERO PII
   * (sem whatsapp/nome/telefone/email/notas). A API entrega so o estado e o
   * timestamp da ultima transicao; o calculo do tempo decorrido e a politica
   * de SLA (horario comercial etc.) vivem no n8n, nao aqui.
   */
  toMonitoramentoSla(): {
    clienteId: string;
    estadoConversa: EstadoConversaAgente;
    estadoAtualizadoEm: string | null;
    urgencia: UrgenciaCompra | null;
    vendedoraSugeridaCodigo: string | null;
    vendedoraAprovadaCodigo: string | null;
    // Timestamp do primeiro contato da vendedora apos o handoff (para o SLA).
    // null = relogio ainda rodando. Permite a Sofia saber se deve alertar.
    primeiroContatoEm: string | null;
  } {
    return {
      clienteId: this.clienteId,
      estadoConversa: this.estadoConversa,
      estadoAtualizadoEm: this.estadoAtualizadoEm
        ? this.estadoAtualizadoEm.toISOString()
        : null,
      urgencia: this.urgencia,
      vendedoraSugeridaCodigo: this.vendedoraSugeridaCodigo,
      vendedoraAprovadaCodigo: this.vendedoraAprovadaCodigo,
      primeiroContatoEm: this.primeiroContatoEm
        ? this.primeiroContatoEm.toISOString()
        : null,
    };
  }

  toPublic(): Record<string, unknown> {
    return {
      clienteId: this.clienteId,
      whatsapp: this.whatsapp,
      origemContato: this.origemContato,
      estadoConversa: this.estadoConversa,
      estadoAtualizadoEm: this.estadoAtualizadoEm,
      tipoCompra: this.tipoCompra,
      urgencia: this.urgencia,
      dataPretendidaCompra: this.dataPretendidaCompra,
      ticketEstimado: this.ticketEstimado,
      intencaoCompra: this.intencaoCompra,
      wishlist: this.wishlist,
      nivelConhecimento: this.nivelConhecimento,
      vendedoraSugeridaCodigo: this.vendedoraSugeridaCodigo,
      vendedoraAprovadaCodigo: this.vendedoraAprovadaCodigo,
      resumoTriagem: this.resumoTriagem,
      notasInternas: this.notasInternas,
      tags: this.tags,
      scorePerfil: this.scorePerfil,
      motivacaoCompra: this.motivacaoCompra,
      primeiroContatoEm: this.primeiroContatoEm,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
    };
  }
}
