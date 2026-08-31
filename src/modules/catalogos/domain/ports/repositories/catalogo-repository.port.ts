import type {
  FormatoCatalogo,
  OrigemFinal,
  OrigemFoto,
  StatusCatalogo,
  StatusFoto,
  TipoReferencia,
} from '../../entities/enums';

export interface FiltroCatalogo {
  status?: StatusCatalogo;
  /** Texto livre sobre nome, tema e numero. */
  busca?: string;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Read-models. Achatados de proposito: a tela nao precisa da entidade de
// dominio, e devolver o ORM cru vazaria nomes de coluna para o contrato HTTP.
// Nenhum deles carrega PII de cliente — os nomes aqui sao de staff.
// ---------------------------------------------------------------------------

export interface ReferenciaItem {
  id: string;
  tipo: TipoReferencia;
  valor: string;
  /** Chave no armazenamento. So existe para IMAGEM. */
  arquivoId: string | null;
  ordem: number;
}

export interface FotoItem {
  id: string;
  posicao: number;
  codigoErp: string | null;
  descricao: string | null;
  precoAVista: number | null;
  parcelas: number | null;
  origem: OrigemFoto;
  remetente: string | null;
  arquivoId: string | null;
  status: StatusFoto;
  versoes: number;
  aprovadoPor: string | null;
  aprovadoEm: Date | null;
}

/** Linha da listagem. Sem referencias e sem fotos — so a contagem. */
export interface CatalogoItem {
  id: string;
  numero: string;
  nome: string;
  tema: string | null;
  formato: FormatoCatalogo;
  status: StatusCatalogo;
  criadoPorNome: string;
  totalFotos: number;
  finalOrigem: OrigemFinal | null;
  createdAt: Date;
}

/** Detalhe: a linha, mais tudo que pendura nela. */
export interface CatalogoDetalhe extends CatalogoItem {
  referencias: ReferenciaItem[];
  fotos: FotoItem[];
  finalArquivoId: string | null;
  finalNomeArquivo: string | null;
  finalEntregueEm: Date | null;
}

export interface ListaCatalogos {
  itens: CatalogoItem[];
  total: number;
}

export interface CriarCatalogoData {
  nome: string;
  tema: string | null;
  formato: FormatoCatalogo;
  criadoPorUserId: string | null;
  criadoPorNome: string;
}

export interface AtualizarCatalogoData {
  nome?: string;
  tema?: string | null;
  formato?: FormatoCatalogo;
  status?: StatusCatalogo;
}

/** O minimo que a agente do WhatsApp precisa para oferecer uma escolha. */
export interface CatalogoAberto {
  id: string;
  numero: string;
  nome: string;
}

export interface CriarFotoData {
  catalogoId: string;
  codigoErp: string | null;
  descricao: string | null;
  precoAVista: number | null;
  parcelas: number | null;
  origem: OrigemFoto;
  remetente: string | null;
  arquivoOriginalId: string | null;
  arquivoId: string | null;
  mime: string | null;
  status: StatusFoto;
}

export interface CriarReferenciaData {
  catalogoId: string;
  tipo: TipoReferencia;
  valor: string;
  arquivoId?: string | null;
  mime?: string | null;
}

export interface ICatalogoRepository {
  criar(dados: CriarCatalogoData): Promise<CatalogoDetalhe>;
  listar(filtro: FiltroCatalogo): Promise<ListaCatalogos>;
  buscarPorId(id: string): Promise<CatalogoDetalhe | null>;
  /** Busca pelo numero visivel ('0042'). E por ele que a agente pergunta. */
  buscarPorNumero(numero: string): Promise<CatalogoDetalhe | null>;
  atualizar(id: string, dados: AtualizarCatalogoData): Promise<CatalogoDetalhe>;
  remover(id: string): Promise<void>;

  /**
   * Nome cadastrado do staff, para o rótulo denormalizado de quem criou. O JWT
   * não carrega nome — só `sub` e e-mail —, então quem quiser exibir "Faby" em
   * vez de "faby@…" precisa buscar. Mesmo caminho das demandas.
   */
  buscarNomeUsuario(userId: string): Promise<string | null>;

  /**
   * Catalogos que a agente pode oferecer no WhatsApp — apenas os liberados
   * (COLETANDO). Rascunho e proposito, nao encomenda: oferecer um catalogo que
   * ninguem liberou faria a foto cair numa colecao sem referencia nenhuma.
   */
  listarAbertos(): Promise<CatalogoAberto[]>;

  /** Acrescenta uma foto ao fim do catalogo. */
  criarFoto(dados: CriarFotoData): Promise<FotoItem>;

  criarReferencia(dados: CriarReferenciaData): Promise<ReferenciaItem>;
  /** Devolve a chave do arquivo removido, para o use case apagar o binario. */
  removerReferencia(
    catalogoId: string,
    referenciaId: string,
  ): Promise<string | null>;
}
