export interface ReceitaMensalItem {
  mes: string; // 'YYYY-MM'
  receita: number;
  totalVendas: number;
}

export interface ReceitaMensal {
  meses: ReceitaMensalItem[];
  meta: number; // meta GLOBAL ativa (0 se nao houver)
}

export interface TopProduto {
  produtoId: string;
  nome: string;
  totalVendas: number;
  receita: number;
  quantidade: number;
}

export interface GiroFornecedor {
  fornecedor: string;
  tempoMedioEstoque: number; // dias
  totalVendas: number;
}

export interface DistribuicaoPagamento {
  forma: string;
  total: number;
  valor: number;
}

export interface InventarioPorCategoria {
  categoria: string;
  quantidade: number;
  totalEstoque: number;
}

export interface EstatisticasInventario {
  total: number;
  valorTotal: number;
  porCategoria: InventarioPorCategoria[];
}

export interface DistribuicaoOrigem {
  origem: string;
  total: number;
}

export interface ContagemRotulo {
  rotulo: string;
  total: number;
}

export interface DemografiaCruzada {
  faixa: string;
  sexo: string;
  total: number;
}

export interface Demografia {
  porSexo: ContagemRotulo[];
  porFaixaEtaria: ContagemRotulo[];
  // Cruzamento sexo x faixa etaria (formato longo) para o grafico de colunas
  // duplas na tela de Analytics (RF-ANL-05). Clientes mantem as visoes isoladas.
  cruzada: DemografiaCruzada[];
}

export interface LinhaVendaCsv {
  id: string;
  dataVenda: string;
  clienteId: string | null;
  vendedoraId: string | null;
  valorTotal: number;
  status: string;
  formasPagamento: string;
}

// Recorte por sexo dentro de uma janela de data comemorativa (RF-CLI-05).
export interface ComportamentoSexo {
  sexo: string; // 'M' | 'F' | 'OUTRO' | 'NAO_INFORMADO'
  totalCompras: number;
  valorTotal: number;
}

export interface ComportamentoData {
  nome: string;
  de: string; // ISO date
  ate: string; // ISO date
  totalCompras: number;
  valorTotal: number;
  // Quebra do mesmo periodo por sexo do cliente (RF-CLI-05).
  porSexo: ComportamentoSexo[];
}

export interface JanelaData {
  nome: string;
  de: Date;
  ate: Date;
}

/** Recorte temporal aplicado as analises baseadas em vendas (RF-ANL-01). */
export interface Periodo {
  dataInicio?: Date;
  dataFim?: Date;
}

export interface ResumoPeriodo {
  receita: number;
  totalVendas: number;
  ticketMedio: number;
}

export interface IAnalyticsRepository {
  receitaMensal(meses: number): Promise<ReceitaMensal>;
  comportamentoDatas(janelas: JanelaData[]): Promise<ComportamentoData[]>;
  topProdutos(limit: number, periodo?: Periodo): Promise<TopProduto[]>;
  giroEstoquePorFornecedor(periodo?: Periodo): Promise<GiroFornecedor[]>;
  distribuicaoPagamento(periodo?: Periodo): Promise<DistribuicaoPagamento[]>;
  resumoPeriodo(periodo?: Periodo): Promise<ResumoPeriodo>;
  estatisticasInventario(): Promise<EstatisticasInventario>;
  distribuicaoOrigem(): Promise<DistribuicaoOrigem[]>;
  demografia(): Promise<Demografia>;
  linhasVendaCsv(dataInicio?: Date, dataFim?: Date): Promise<LinhaVendaCsv[]>;
}
