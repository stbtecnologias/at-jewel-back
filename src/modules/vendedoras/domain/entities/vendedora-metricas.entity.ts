export interface VendedoraMetricasProps {
  vendedoraId: string;
  totalVendas: number;
  receitaTotal: number;
  ticketMedio: number;
  clientesDistintos: number;
  clientesRecorrentes: number;
  taxaRecompra: number;
  // Null enquanto data_contato nao for backfillada para as vendas da
  // vendedora (ver migracao 10). Horas medias entre contato e fechamento.
  tempoMedioFechamentoHoras: number | null;
  primeiraVendaEm: Date | null;
  ultimaVendaEm: Date | null;
  // Carimbo do refresh da matview (now() no momento do REFRESH).
  atualizadoEm: Date;
}

/**
 * Representacao de dominio das metricas agregadas de uma vendedora.
 *
 * Vem da VIEW MATERIALIZADA `vendedoras_metricas` (migracao 10), nao de
 * uma tabela. E somente leitura: nao ha construcao a partir de input do
 * usuario, so mapeamento a partir do repositorio.
 *
 * Contem APENAS agregados (contagens, somas, medias) e a FK vendedora_id.
 * Sem PII de cliente — nenhum cliente individual e exposto.
 */
export class VendedoraMetricas {
  readonly vendedoraId: string;
  readonly totalVendas: number;
  readonly receitaTotal: number;
  readonly ticketMedio: number;
  readonly clientesDistintos: number;
  readonly clientesRecorrentes: number;
  readonly taxaRecompra: number;
  readonly tempoMedioFechamentoHoras: number | null;
  readonly primeiraVendaEm: Date | null;
  readonly ultimaVendaEm: Date | null;
  readonly atualizadoEm: Date;

  private constructor(props: VendedoraMetricasProps) {
    this.vendedoraId = props.vendedoraId;
    this.totalVendas = props.totalVendas;
    this.receitaTotal = props.receitaTotal;
    this.ticketMedio = props.ticketMedio;
    this.clientesDistintos = props.clientesDistintos;
    this.clientesRecorrentes = props.clientesRecorrentes;
    this.taxaRecompra = props.taxaRecompra;
    this.tempoMedioFechamentoHoras = props.tempoMedioFechamentoHoras;
    this.primeiraVendaEm = props.primeiraVendaEm;
    this.ultimaVendaEm = props.ultimaVendaEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: VendedoraMetricasProps): VendedoraMetricas {
    return new VendedoraMetricas(props);
  }

  // Serializacao para a resposta HTTP. Sem PII, so agregados — pode ser
  // exposta integralmente para ADMIN/GERENTE.
  toPublic(): Record<string, unknown> {
    return {
      vendedoraId: this.vendedoraId,
      totalVendas: this.totalVendas,
      receitaTotal: this.receitaTotal,
      ticketMedio: this.ticketMedio,
      clientesDistintos: this.clientesDistintos,
      clientesRecorrentes: this.clientesRecorrentes,
      taxaRecompra: this.taxaRecompra,
      tempoMedioFechamentoHoras: this.tempoMedioFechamentoHoras,
      primeiraVendaEm: this.primeiraVendaEm,
      ultimaVendaEm: this.ultimaVendaEm,
      atualizadoEm: this.atualizadoEm,
    };
  }
}
