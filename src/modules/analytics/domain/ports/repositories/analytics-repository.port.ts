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

export interface Demografia {
  porSexo: ContagemRotulo[];
  porFaixaEtaria: ContagemRotulo[];
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

export interface IAnalyticsRepository {
  receitaMensal(meses: number): Promise<ReceitaMensal>;
  topProdutos(limit: number): Promise<TopProduto[]>;
  giroEstoquePorFornecedor(): Promise<GiroFornecedor[]>;
  distribuicaoPagamento(): Promise<DistribuicaoPagamento[]>;
  estatisticasInventario(): Promise<EstatisticasInventario>;
  distribuicaoOrigem(): Promise<DistribuicaoOrigem[]>;
  demografia(): Promise<Demografia>;
  linhasVendaCsv(dataInicio?: Date, dataFim?: Date): Promise<LinhaVendaCsv[]>;
}
