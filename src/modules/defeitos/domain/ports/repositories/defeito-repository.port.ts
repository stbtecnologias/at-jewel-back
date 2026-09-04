import type { Defeito } from '../../entities/defeito.entity';
import type { TipoDefeito } from '../../entities/enums';

export interface FiltroDefeito {
  tipo?: TipoDefeito;
  produtoId?: string;
  /** De quem era a peca. E o filtro que faz a consulta virar HISTORICO. */
  clienteId?: string;
  dataInicio?: Date;
  dataFim?: Date;
  page: number;
  limit: number;
}

/** Uma foto da ocorrencia. Guarda a CHAVE do armazenamento, nunca a URL. */
export interface FotoOcorrencia {
  id: string;
  arquivoId: string;
  mime: string;
  nomeArquivo: string | null;
  ordem: number;
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
  /** `null` desvincula. Diferente de ausente, que nao mexe. */
  clienteId?: string | null;
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

  /** Anexa uma foto a ocorrencia. A ordem e o fim da fila. */
  anexarFoto(
    ocorrenciaId: string,
    dados: { arquivoId: string; mime: string; nomeArquivo: string | null },
  ): Promise<FotoOcorrencia>;

  /**
   * Remove a foto e devolve a CHAVE que estava nela, para quem chama apagar do
   * armazenamento. `null` quando o par ocorrencia/foto nao existe — o id da
   * ocorrencia entra na busca para nao dar para apagar foto de outra.
   */
  removerFoto(ocorrenciaId: string, fotoId: string): Promise<string | null>;
}
