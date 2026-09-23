import { Produto } from '../../entities/produto.entity';

export interface FiltroProduto {
  categoria?: string;
  familia?: string;
  ativo?: boolean;
  /**
   * Texto livre. Varre descricao, categoria, familia, colecao, pedra, cor e
   * codigo do ERP — as colunas por onde uma pessoa procura uma joia.
   *
   * Nasceu para o canal interno: a vendedora pergunta "quanto custa o brinco de
   * esmeralda", e ate aqui so dava para filtrar por categoria e familia exatas.
   */
  busca?: string;
  /** Teto de resultados. Sem ele, uma busca vaga devolve o catalogo inteiro. */
  limit?: number;
}

// Valores distintos para preencher filtros na UI.
export interface FacetasProduto {
  fornecedores: string[];
  categorias: string[];
  familias: string[];
  /**
   * Tipos de pedra JA USADOS. Nao ha cadastro de pedras — `tipo_pedra` e texto
   * livre no produto —, entao a lista e o que a propria base ensina.
   */
  pedras: string[];
  /** Colecoes ja usadas. Mesma logica das pedras. */
  colecoes: string[];
  /** Cores ja usadas. Mesma logica. */
  cores: string[];
  /**
   * TODOS OS CADASTRADOS e ativos, e nao so os que tem peca — pedido do Lucas
   * em 17/09/2026: filtrar por um lugar vazio tem de mostrar que ali nao ha
   * nada, e nao esconder o lugar. Diferente de pedras/cores, estes tem tabela
   * propria.
   */
  empresas: string[];
  locais: string[];
  grupos: string[];
}

export interface ProdutoAlerta {
  id: string;
  nome: string;
  categoria: string;
  familia: string;
  fornecedor: string | null;
  estoqueAtual: number;
  diasEmEstoque: number | null;
}

export interface AlertasEstoque {
  /** As primeiras, ate o teto da consulta — NAO e a contagem. */
  estoqueBaixo: ProdutoAlerta[];
  giroLento: ProdutoAlerta[];
  /**
   * Quantas sao DE VERDADE, sem o teto.
   *
   * Ate 11/09/2026 so havia as listas, cortadas em 50, e a tela usava o
   * tamanho delas como contagem: "Estoque baixo (50)" com o numero real bem
   * acima. Teto silencioso mente por omissao — a listagem que corta devolve o
   * total junto.
   */
  totalEstoqueBaixo: number;
  totalGiroLento: number;
}

/**
 * Uma linha do saldo da peca: quanto ha em cada empresa × local × grupo.
 * A soma de todas e o `estoqueAtual` do produto.
 */
export interface SaldoDaPeca {
  empresa: string;
  local: string;
  grupo: string;
  quantidade: number;
  atualizadoEm: Date;
}

export interface IProdutoRepository {
  upsertByCodigoErp(produto: Produto): Promise<Produto>;
  findByCodigoErp(codigoErp: string): Promise<Produto | null>;
  /**
   * QUAIS DOS NOSSOS CODIGOS APARECEM NESTE TEXTO — a pergunta invertida.
   *
   * Nasceu do leitor de legenda do WhatsApp. Ele reconhecia codigo pela FORMA
   * (duas letras seguidas de digitos), e a base real desmente qualquer forma:
   * medido na producao em 04/09/2026, dos 6.938 codigos ha 9 COM ESPACO dentro
   * (`TABUA QUEIJO  LAGUIO`), 6 de UM caractere (`1`, `2`) e alguns sem digito
   * nenhum (`PINGENTE`, `VASOITA`). Nenhum recorte por formato cobre isso.
   *
   * Devolve do MAIS LONGO para o mais curto, e a ordem e a regra: numa legenda
   * com `1-25-3A-2` casa tambem o `1`, e quem vale e o maior.
   *
   * QUEM CHAMA AINDA PRECISA CONFERIR A BORDA. Esta consulta acha o codigo em
   * qualquer posicao, inclusive no meio de outra palavra — o `1` esta dentro de
   * `CO26185`. A checagem de borda fica em quem chama porque depende do que
   * conta como separador naquele texto, e nao da tabela.
   */
  buscarCodigosPresentesEm(texto: string): Promise<string[]>;
  /** Identidade no ERP — imutavel, ao contrario do `codigo_erp`. */
  findByIdErp(idErp: string): Promise<Produto | null>;
  findAll(filtros: FiltroProduto): Promise<Produto[]>;
  findById(id: string): Promise<Produto | null>;
  save(produto: Produto): Promise<Produto>;
  /**
   * Grava SO a chave da foto propria. `null` limpa, e a peca volta a exibir a
   * foto do ERP.
   *
   * Metodo proprio, e nao um campo no `save`, porque `save` e `upsert` passam
   * pelo mesmo mapeamento que o ERP usa — e um dia alguem faria a foto subida
   * pela loja viajar junto com uma sincronizacao. Aqui o UPDATE toca uma
   * coluna so, e nao ha como levar outra no caminho.
   */
  definirFotoArquivo(id: string, chave: string | null): Promise<void>;
  // Persiste varios produtos numa unica transacao (all-or-nothing).
  saveMany(produtos: Produto[]): Promise<Produto[]>;
  remover(id: string): Promise<void>;
  facetas(): Promise<FacetasProduto>;
  alertasEstoque(limiteBaixo: number, diasGiroLento: number): Promise<AlertasEstoque>;
  /**
   * Onde esta o saldo da peca, linha a linha — so as linhas COM quantidade:
   * a carga do integrador traz uma linha zerada para quase toda peca, e na
   * tela ela so diria "nada aqui".
   */
  saldoPorEmpresa(produtoId: string): Promise<SaldoDaPeca[]>;
}
