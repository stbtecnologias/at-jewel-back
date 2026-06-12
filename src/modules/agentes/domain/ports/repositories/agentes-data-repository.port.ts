// Consultas de apoio que alimentam os agentes com dados do nosso modelo.
// Tudo agregado / sem PII de cliente.

export interface KpisVendas {
  receitaTotal: number;
  totalVendas: number;
}

export interface DemografiaItem {
  sexo: string;
  faixaEtaria: string;
  total: number;
}

export interface AlertaEstoque {
  produtoId: string;
  nome: string;
  categoria: string;
  fornecedor: string | null;
  estoqueAtual: number;
}

export interface GiroLento {
  produtoId: string;
  nome: string;
  categoria: string;
  estoqueAtual: number;
  diasEmEstoque: number;
}

export interface ProdutoAnalise {
  produtoId: string;
  nome: string;
  categoria: string;
  tipoPedra: string | null;
  fornecedor: string | null;
  estoqueAtual: number;
  dataEntradaEstoque: Date | null;
  totalVendas: number;
  ultimasVendas: { dataVenda: string; valor: number }[];
  ocorrencias: { tipo: string; descricao: string; data: string }[];
}

export interface IAgentesDataRepository {
  kpisVendas(dataInicio?: Date, dataFim?: Date): Promise<KpisVendas>;
  demografia(): Promise<DemografiaItem[]>;
  alertasEstoque(limite: number): Promise<AlertaEstoque[]>;
  giroLento(diasMin: number, limite: number): Promise<GiroLento[]>;
  analisarProduto(produtoId: string): Promise<ProdutoAnalise | null>;
}
