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
  /**
   * MIME do arquivo. Ja era guardado; passou a sair na resposta porque a tela
   * precisa distinguir a pagina escaneada do PDF — uma vira miniatura, o outro
   * vira cartao de arquivo, e `<img src="...pdf">` nao desenha nada.
   */
  mime: string | null;
  /**
   * O que foi pedido DESTE arquivo. So faz sentido em referencia com arquivo —
   * na de texto, o texto ja e a observacao. Ver a migracao 49.
   */
  observacao: string | null;
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
  jurosPercentual?: number | null;
}

/**
 * O VALOR DA PARCELA.
 *
 * ==========================================================================
 * SEM JURO INFORMADO, NAO HA JURO. Decidido com o Lucas em 04/09/2026:
 *
 *   "se ela nao passar nada do whats sobre juros, vai ser o valor geral —
 *    1000 reais a peca. Se ela mandar apenas 10x, por padrao e sem juros.
 *    Se ela colocar, ai aplica."
 *
 *   juros informado   total = a_vista * (1 + juros/100)
 *   juros ausente     total = a_vista
 *
 * ISTO SUBSTITUI A REGRA DA CASA que vigorou ate aqui: dividir o a vista por
 * 0,80 em 10X e por 0,90 em 6X — 25% embutidos sem ninguem ter pedido. Ela
 * tinha sido levantada em 25 de 25 pecas em 20/08/2026 e conferida contra a
 * pagina impressa, entao era verdadeira sobre os catalogos ANTIGOS; deixou de
 * ser a regra da casa por decisao, e nao por engano de leitura.
 *
 * CONSEQUENCIA ACEITA: peca ja cadastrada com `juros_percentual` NULL passa a
 * ser impressa mais barata — R$35.920,00 em 10X saia 10 X R$4.490,00 e passa
 * a sair 10 X R$3.592,00. Nao ha migracao de dados: quem quiser o acrescimo
 * antigo escreve o percentual na legenda.
 *
 * NULL e 0 passaram a dar o mesmo numero, e a coluna continua distinguindo os
 * dois de proposito — um e "ninguem informou", o outro e "foi dito que nao
 * tem". A distincao deixou de mudar a conta; nao deixou de ser informacao.
 *
 * ESTA FUNCAO TEM UM GEMEO no front (`esboco.tsx`). Nao ha pacote
 * compartilhado entre os repositorios; mudou aqui, mude la.
 * ==========================================================================
 */
export function valorDaParcela(
  precoAVista: number,
  parcelas: number,
  jurosPercentual: number | null,
): number {
  // `== null` COBRE undefined DE PROPOSITO. O valor chega de JSON em alguns
  // caminhos, e ali um campo ausente e `undefined`, nao `null` — com `===` ele
  // cairia na multiplicacao e produziria NaN, que vira "R$NaN" impresso na
  // pagina. O lado seguro de errar aqui e nao acrescentar nada.
  const total =
    jurosPercentual == null
      ? precoAVista
      : precoAVista * (1 + jurosPercentual / 100);

  return total / parcelas;
}

export interface FotoItem {
  id: string;
  catalogoId: string;
  posicao: number;
  codigoErp: string | null;
  descricao: string | null;
  precoAVista: number | null;
  parcelas: number | null;
  /** Juro do parcelamento em %. NULL = nao informado, vale a regra da casa. */
  jurosPercentual: number | null;
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

  /**
   * Referencia escolhida como capa. `null` = automatica.
   *
   * Vem na LISTAGEM tambem porque o card precisa dela — e e o motivo de a
   * resolucao morar no repositorio: lista e detalhe leem a mesma regra e nao
   * tem como discordar sobre qual imagem e a capa.
   */
  capaReferenciaId: string | null;

  /**
   * Chave da imagem que a tela desenha como capa — JA RESOLVIDA: a escolhida,
   * se houver; senao a primeira referencia de imagem; `null` se nao houver
   * imagem nenhuma, e ai a tela desenha o esboco.
   */
  capaArquivoId: string | null;
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
  jurosPercentual: number | null;
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
  /**
   * Marca (ou desmarca, com `null`) a referencia que serve de capa.
   *
   * Metodo proprio, fora do `atualizar`, porque o corpo daquele vem de um DTO
   * que o usuario preenche: um `capaReferenciaId` la aceitaria o id de uma
   * referencia de OUTRO catalogo. Aqui da para exigir que ela seja deste, e e
   * o que o use case faz.
   */
  definirCapa(id: string, referenciaId: string | null): Promise<CatalogoDetalhe>;
  /**
   * A nota daquele arquivo. `null` apaga.
   *
   * Recebe o `catalogoId` junto do id da referencia de proposito: sem ele, a
   * rota aceitaria anotar a referencia de outra colecao — a mesma armadilha da
   * capa. Devolve `null` quando o par nao existe, e quem chama vira isso em
   * 404.
   */
  anotarReferencia(
    catalogoId: string,
    referenciaId: string,
    observacao: string | null,
  ): Promise<ReferenciaItem | null>;
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
