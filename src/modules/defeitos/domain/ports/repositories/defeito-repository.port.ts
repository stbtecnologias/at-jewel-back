import type { Defeito } from '../../entities/defeito.entity';
import type { TipoDefeito } from '../../entities/enums';

export interface FiltroDefeito {
  tipo?: TipoDefeito;
  produtoId?: string;
  dataInicio?: Date;
  dataFim?: Date;
  page: number;
  limit: number;
}

export interface ResultadoPaginadoDefeito {
  data: Defeito[];
  total: number;
}

export interface FiltroKpiDefeito {
  dataInicio?: Date;
  dataFim?: Date;
}

export interface DefeitoKpis {
  total: number;
  porTipo: { tipo: TipoDefeito; total: number }[];
}

export interface AtualizarDefeitoData {
  produtoId?: string;
  tipo?: TipoDefeito;
  descricao?: string;
  data?: Date;
  resolucao?: string | null;
}

export interface IDefeitoRepository {
  criar(defeito: Defeito): Promise<Defeito>;
  listar(filtro: FiltroDefeito): Promise<ResultadoPaginadoDefeito>;
  buscarPorId(id: string): Promise<Defeito | null>;
  atualizar(id: string, dados: AtualizarDefeitoData): Promise<Defeito>;
  remover(id: string): Promise<void>;
  kpis(filtro: FiltroKpiDefeito): Promise<DefeitoKpis>;
}
