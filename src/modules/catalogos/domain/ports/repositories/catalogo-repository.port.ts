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

export interface AtualizarFotoData {
  arquivoId?: string;
  mime?: string;
  status?: StatusFoto;
  /** Contador de tentativas — e o que sustenta o teto de geracoes. */
  versoes?: number;
  aprovadoPor?: string | null;
  aprovadoEm?: Date | null;

  /**
   * O DESCRITIVO CHEGA DEPOIS quando a foto veio sem código.
   *
   * A pessoa manda a foto, responde de qual catálogo é, e só então digita
   * `BR26252`. Até 01/09/2026 esses quatro campos só podiam ser gravados na
   * criação, e o código digitado depois não tinha onde entrar — a mensagem
   * convidava a mandá-lo e ninguém escutava.
   */
  codigoErp?: string | null;
  descricao?: string | null;
  precoAVista?: number | null;
  parcelas?: number | null;
}

export interface FotoItem {
  id: string;
  catalogoId: string;
  posicao: number;
  codigoErp: string | null;
  descricao: string | null;
  precoAVista: number | null;
  parcelas: number | null;
  origem: OrigemFoto;
  remetente: string | null;
  /** A foto como saiu do celular. NUNCA e reescrita. */
  arquivoOriginalId: string | null;
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

  /**
   * As versões da peça final, da mais nova para a mais velha. A PRIMEIRA é a
   * que vale — não existe campo "atual", porque ele seria uma segunda verdade
   * a divergir desta lista.
   *
   * Os `final*` abaixo são DERIVADOS de `finais[0]`, e existem só porque a
   * tela já os consumia. São cópia de leitura, nunca dado guardado.
   */
  finais: FinalItem[];
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

/**
 * Uma versão da peça final — venha ela do nosso montador ou do marketing.
 *
 * Não entra em `AtualizarCatalogoData` de propósito: aquele é o que a TELA DE
 * EDIÇÃO altera, e o arquivo final não é campo de formulário. Misturar os dois
 * abriria um `PATCH /catalogos/:id` capaz de apontar o catálogo para qualquer
 * chave de arquivo.
 */
export interface RegistrarFinalData {
  origem: OrigemFinal;
  arquivoId: string;
  nomeArquivo: string;
  mime: string | null;
  tamanhoBytes: number | null;
  /** Nome do staff que enviou. Nulo quando foi o sistema que montou. */
  enviadoPor: string | null;
}

/** Uma versão já entregue. A mais recente é a que vale. */
export interface FinalItem {
  id: string;
  origem: OrigemFinal;
  arquivoId: string;
  nomeArquivo: string;
  mime: string | null;
  tamanhoBytes: number | null;
  enviadoPor: string | null;
  createdAt: Date;
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
   * Acrescenta uma versão da peça final. NÃO apaga nada: a anterior continua
   * baixável, e a nova passa a ser a atual por ser a mais recente.
   *
   * Foi um slot único até 01/09/2026, e o slot único fazia montar o catálogo
   * apagar o arquivo do marketing — e o contrário. Ver a migração 44.
   */
  registrarFinal(id: string, dados: RegistrarFinalData): Promise<FinalItem>;

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

  /**
   * Atualiza a foto depois do tratamento: a chave da versao tratada, o novo
   * status e o historico de tentativas.
   *
   * `arquivoOriginalId` NAO entra aqui — o original nunca e reescrito.
   */
  atualizarFoto(id: string, dados: AtualizarFotoData): Promise<FotoItem>;

  buscarFotoPorId(id: string): Promise<FotoItem | null>;

  /**
   * As fotos que esperam o sim de quem as mandou, da mais antiga para a mais
   * nova.
   *
   * FILTRA PELO REMETENTE, e nao so pelo status: quem aprova e quem
   * fotografou. Sem o filtro, um "aprovo" no WhatsApp carimbaria a foto de
   * outra pessoa que estivesse na fila no mesmo minuto.
   *
   * A ordem e a da ultima alteracao, que e a ordem em que as versoes tratadas
   * chegaram no celular — assim "aprovo" atinge a que ela viu primeiro.
   */
  listarEmAprovacao(remetente: string): Promise<FotoItem[]>;

  /**
   * Apaga a foto de vez — a linha, e quem chama apaga os arquivos.
   *
   * DIFERENTE DE `REPROVADA`, que tira do catálogo mas guarda. Este caminho
   * existe para o descarte na conversa: a peça nunca chegou a entrar no
   * catálogo, ninguém a aprovou, e guardar uma foto que a própria pessoa disse
   * para jogar fora só acumularia lixo que ninguém sabe interpretar depois.
   */
  removerFoto(id: string): Promise<void>;

  criarReferencia(dados: CriarReferenciaData): Promise<ReferenciaItem>;
  /** Devolve a chave do arquivo removido, para o use case apagar o binario. */
  removerReferencia(
    catalogoId: string,
    referenciaId: string,
  ): Promise<string | null>;
}
