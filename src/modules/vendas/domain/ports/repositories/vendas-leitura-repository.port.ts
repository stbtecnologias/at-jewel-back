import type {
  ComparativoVendedora,
  FiltroVenda,
  ResumoVendas,
  SerieMensalVendas,
  VendaResumo,
} from './venda-repository.port';

/**
 * AS QUATRO CONSULTAS DA TELA DE VENDAS — 25/09/2026.
 *
 * ==========================================================================
 * A TELA PASSA A LER A MOVIMENTACAO, E NAO A TABELA `vendas`.
 *
 * Decisao do Lucas. A copia de producao de 25/09 tem 1.388 documentos de
 * movimentacao — 1.287 VENDA e 101 DEVOLUCAO, de junho/2023 a setembro/2026,
 * R$ 66,2 milhoes, com cliente, vendedora e produto resolvidos em todos — e a
 * tabela `vendas` tem ZERO linhas. A tela mostrava "nenhuma venda" com tres
 * anos de historico no banco.
 *
 * POR QUE UMA PORTA NOVA, E NAO TROCAR O SQL DA ANTIGA: o `IVendaRepository`
 * tem 12 metodos, e os outros oito continuam servindo a escrita e a outras
 * telas. Separando, o caminho antigo fica inteiro e a troca vira a escolha de
 * qual repositorio cada use case injeta — reversivel numa linha.
 *
 * ESCOPO DELIBERADO: so a tela de Vendas. Analytics, Top produtos, metas e os
 * giros continuam lendo `vendas` e continuam vazios. Ver o levantamento de
 * 25/09 no vault.
 * ==========================================================================
 */
export interface IVendasLeituraRepository {
  listar(filtros: FiltroVenda): Promise<VendaResumo[]>;
  resumoAgregado(filtros: FiltroVenda): Promise<ResumoVendas>;
  comparativoPorVendedora(filtros: FiltroVenda): Promise<ComparativoVendedora[]>;
  serieMensal(
    filtros: FiltroVenda,
    janela: { de: Date; ate: Date },
  ): Promise<SerieMensalVendas>;
}

export const VENDAS_LEITURA_REPOSITORY = Symbol('IVendasLeituraRepository');
