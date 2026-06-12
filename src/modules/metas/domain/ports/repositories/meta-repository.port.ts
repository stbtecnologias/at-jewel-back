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
  // Soma o realizado (receita) atribuivel a meta, na janela criado_em -> prazo,
  // de acordo com o tipo (GLOBAL/POR_VENDEDORA/POR_CLIENTE/POR_PRODUTO).
  calcularRealizado(meta: Meta): Promise<number>;
}
