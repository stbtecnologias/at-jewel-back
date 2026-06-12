import type { Meta } from '../../entities/meta.entity';
import type { TipoMeta } from '../../entities/enums';

export interface FiltroMeta {
  tipo?: TipoMeta;
  referenciaId?: string;
}

export interface AtualizarMetaData {
  tipo?: TipoMeta;
  referenciaId?: string | null;
  valorAlvo?: number;
  prazo?: Date;
  descricao?: string | null;
}

export interface IMetaRepository {
  criar(meta: Meta): Promise<Meta>;
  listar(filtro: FiltroMeta): Promise<Meta[]>;
  buscarPorId(id: string): Promise<Meta | null>;
  atualizar(id: string, dados: AtualizarMetaData): Promise<Meta>;
  remover(id: string): Promise<void>;
}
