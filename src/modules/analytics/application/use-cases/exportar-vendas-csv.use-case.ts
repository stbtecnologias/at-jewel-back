import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAnalyticsRepository } from '../../domain/ports/repositories/analytics-repository.port';

@Injectable()
export class ExportarVendasCsvUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: IAnalyticsRepository,
  ) {}

  async execute(dataInicio?: Date, dataFim?: Date): Promise<string> {
    const linhas = await this.repo.linhasVendaCsv(dataInicio, dataFim);
    const cabecalho = [
      'id',
      'data_venda',
      'cliente_id',
      'vendedora_id',
      'valor_total',
      'status',
      'formas_pagamento',
    ];
    const linhasCsv = linhas.map((l) =>
      [
        l.id,
        l.dataVenda,
        l.clienteId ?? '',
        l.vendedoraId ?? '',
        l.valorTotal.toFixed(2),
        l.status,
        l.formasPagamento,
      ]
        .map((c) => this.escapar(String(c)))
        .join(','),
    );
    return [cabecalho.join(','), ...linhasCsv].join('\n');
  }

  // Escapa campos conforme RFC 4180 (aspas duplas quando ha , " ou quebra).
  private escapar(valor: string): string {
    if (/[",\n\r]/.test(valor)) {
      return `"${valor.replace(/"/g, '""')}"`;
    }
    return valor;
  }
}
