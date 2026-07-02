import type { Consignacao } from '../../entities/consignacao.entity';
import type { DestinoConsignacao, StatusConsignacao } from '../../entities/enums';

export interface FiltroConsignacao {
  status?: StatusConsignacao;
  destinoTipo?: DestinoConsignacao;
  produtoId?: string;
  // Recorte sobre data_saida.
  dataDe?: Date;
  dataAte?: Date;
  limit: number;
  offset: number;
}

// Read-model achatado devolvido nas listagens e no detalhe. Ja
// traz os nomes resolvidos por JOIN (produto/cliente/vendedora).
// NAO contem hashes nem PII sensivel (telefone/email) — apenas o
// nome operacional, que e plaintext nas tabelas de origem.
export interface ConsignacaoItem {
  id: string;
  produtoId: string;
  produtoNome: string | null;
  quantidade: number;
  destinoTipo: DestinoConsignacao;
  clienteId: string | null;
  clienteNome: string | null;
  vendedoraId: string | null;
  vendedoraNome: string | null;
  status: StatusConsignacao;
  dataSaida: Date;
  dataPrevistaRetorno: Date | null;
  dataRetorno: Date | null;
  observacao: string | null;
  createdAt: Date;
}

export interface ListaConsignacoes {
  itens: ConsignacaoItem[];
  total: number;
}

export interface ResumoConsignacoes {
  abertas: number;
  pecasFora: number;
  valorEstimado: number;
}

export interface AtualizarConsignacaoData {
  status?: StatusConsignacao;
  dataRetorno?: Date | null;
  observacao?: string | null;
}

export interface IConsignacaoRepository {
  criar(consignacao: Consignacao): Promise<Consignacao>;
  listar(filtro: FiltroConsignacao): Promise<ListaConsignacoes>;
  // Detalhe enriquecido (com nomes) para GET /:id.
  buscarItemPorId(id: string): Promise<ConsignacaoItem | null>;
  // Entidade de dominio crua para checagens internas (existencia,
  // regras de transicao de estado).
  buscarPorId(id: string): Promise<Consignacao | null>;
  atualizar(id: string, dados: AtualizarConsignacaoData): Promise<ConsignacaoItem>;
  resumo(): Promise<ResumoConsignacoes>;
}
