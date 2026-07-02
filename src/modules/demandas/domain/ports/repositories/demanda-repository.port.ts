import type { Demanda } from '../../entities/demanda.entity';
import type { StatusDemanda, TipoDemanda } from '../../entities/enums';

export interface FiltroDemanda {
  status?: StatusDemanda;
  tipo?: TipoDemanda;
  // Recorte sobre created_at.
  dataDe?: Date;
  dataAte?: Date;
  // Escopo por solicitante: quem nao tem demandas:manage so ve as proprias.
  solicitanteUserId?: string;
  limit: number;
  offset: number;
}

// Read-model achatado devolvido nas listagens e no detalhe. NAO
// contem PII de cliente — solicitanteNome e o rotulo operacional da
// propria usuaria (staff) que abriu a demanda.
export interface DemandaItem {
  id: string;
  solicitanteNome: string;
  canal: string;
  tipo: TipoDemanda;
  descricao: string;
  status: StatusDemanda;
  resposta: string | null;
  createdAt: Date;
  atualizadaEm: Date;
  concluidaEm: Date | null;
}

export interface ListaDemandas {
  itens: DemandaItem[];
  total: number;
}

export interface KpisDemandas {
  abertas: number;
  emAndamento: number;
  concluidas30d: number;
  tempoMedioConclusaoHoras: number;
}

export interface AtualizarDemandaData {
  status?: StatusDemanda;
  resposta?: string | null;
  // Carimbo de conclusao calculado no use case (now() na 1a conclusao).
  concluidaEm?: Date | null;
}

export interface IDemandaRepository {
  criar(demanda: Demanda): Promise<Demanda>;
  listar(filtro: FiltroDemanda): Promise<ListaDemandas>;
  // Detalhe achatado para GET /:id.
  buscarItemPorId(id: string): Promise<DemandaItem | null>;
  // Entidade de dominio crua para checagens internas (existencia,
  // estado atual antes de uma transicao).
  buscarPorId(id: string): Promise<Demanda | null>;
  atualizar(id: string, dados: AtualizarDemandaData): Promise<DemandaItem>;
  // Com solicitanteUserId, os KPIs consideram apenas as demandas dele.
  kpis(solicitanteUserId?: string): Promise<KpisDemandas>;
  // Rotulo denormalizado de quem abriu (nome do staff). Usado na
  // criacao para preencher solicitante_nome sem acoplar ao modulo auth.
  buscarNomeUsuario(userId: string): Promise<string | null>;
}
