import type { FotoOcorrencia } from '../ports/repositories/defeito-repository.port';
import type { TipoDefeito } from './enums';

export interface DefeitoProps {
  id?: string;
  produtoId: string;
  clienteId?: string | null;
  produtoCodigo?: string | null;
  produtoDescricao?: string | null;
  clienteNome?: string | null;
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

  // ====================================================================
  // OS NOMES VEM DA CONSULTA, e nao de uma leitura a parte.
  //
  // Ate 23/09/2026 a tela mostrava os 8 primeiros caracteres do UUID do
  // produto — "36802054…" —, que nao se pesquisa, nao se le e nao se fala.
  // O Lucas tentou procurar a peca por aquilo e nao achou nada, o que era
  // esperado: nao e codigo de coisa nenhuma.
  //
  // Traduzir no navegador exigiria baixar as 7.116 pecas do catalogo para
  // resolver um punhado de linhas. Este mesmo repositorio ja tinha recusado
  // o caminho ingenuo uma vez, nas fotos ("numa consulta so, e nao uma por
  // linha").
  //
  // Sao CAMPOS DE LEITURA: so a listagem os preenche. Ficam nulos em
  // qualquer outro caminho, e nada no dominio decide com base neles.
  // ====================================================================

  /** O codigo da peca — `CA25129`. Nulo se o produto foi apagado. */
  readonly produtoCodigo: string | null;
  /** A descricao de etiqueta — "ANEL OURO 24K YEAH". */
  readonly produtoDescricao: string | null;
  /** O nome do cliente, quando a ocorrencia tem um. */
  readonly clienteNome: string | null;
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
    this.produtoCodigo = props.produtoCodigo ?? null;
    this.produtoDescricao = props.produtoDescricao ?? null;
    this.clienteNome = props.clienteNome ?? null;
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
