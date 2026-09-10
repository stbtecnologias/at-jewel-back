import type { FotoOcorrencia } from '../ports/repositories/defeito-repository.port';
import type { TipoDefeito } from './enums';

export interface DefeitoProps {
  id?: string;
  produtoId: string;
  clienteId?: string | null;
  fotos?: FotoOcorrencia[];
  tipo: TipoDefeito;
  descricao: string;
  data: Date;
  resolucao?: string | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class Defeito {
  readonly id: string | undefined;
  readonly produtoId: string;
  /** De quem era a peca. `null` = nao passou por cliente. */
  readonly clienteId: string | null;
  readonly tipo: TipoDefeito;
  /** As fotos da ocorrencia. Vazio quando ninguem anexou. */
  readonly fotos: FotoOcorrencia[];
  readonly descricao: string;
  readonly data: Date;
  readonly resolucao: string | null;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: DefeitoProps) {
    this.id = props.id;
    this.produtoId = props.produtoId;
    this.clienteId = props.clienteId ?? null;
    this.tipo = props.tipo;
    this.fotos = props.fotos ?? [];
    this.descricao = props.descricao;
    this.data = props.data;
    this.resolucao = props.resolucao ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: DefeitoProps): Defeito {
    if (!props.produtoId) {
      throw new Error('Ocorrencia exige produtoId');
    }
    if (!props.descricao?.trim()) {
      throw new Error('Ocorrencia exige descricao');
    }
    return new Defeito(props);
  }
}
