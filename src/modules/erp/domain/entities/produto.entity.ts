/**
 * Uma posição do estoque da peça: empresa × local × grupo, com a quantidade.
 * Vem da tabela `estoque` (o integrador), INCLUSIVE as zeradas — a tela filtra
 * por empresa, local e grupo, e a peça que existe num lugar com zero também
 * precisa ser achada ali.
 */
export interface PosicaoDeEstoque {
  empresa: string;
  local: string;
  grupo: string;
  quantidade: number;
}

export interface ProdutoProps {
  /** Identidade no ERP: chave da tabela la, imutavel. */
  idErp?: string | null;
  id?: string;
  codigoErp: string | null;
  categoria: string;
  familia: string;
  colecao?: string | null;
  cor?: string | null;
  tamanho?: string | null;
  tipoPedra?: string | null;
  colecaoPedra?: string | null;
  referenciaFornecedor?: string | null;
  descricaoEtiqueta?: string | null;
  pesoGramas?: number | null;
  unidade: string;
  valorCompra?: number | null;
  valorCusto?: number | null;
  margemPercentual?: number | null;
  valorVenda: number;
  observacao?: string | null;
  fotoUrl?: string | null;
  /**
   * Chave da foto NOSSA no armazenamento (`produtos/CO26185/uuid.jpg`).
   * Distinta de `fotoUrl`, que e do ERP — ver a migracao 47. Tem precedencia
   * sobre ela na hora de exibir.
   */
  fotoArquivoId?: string | null;
  ativo: boolean;
  estoqueAtual?: number | null;
  /** As posições do estoque. A soma das quantidades é o `estoqueAtual`. */
  posicoes?: PosicaoDeEstoque[];
  dataEntradaEstoque?: Date | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class Produto {
  readonly idErp: string | null;
  readonly id: string | undefined;
  readonly codigoErp: string | null;
  readonly categoria: string;
  readonly familia: string;
  readonly colecao: string | null;
  readonly cor: string | null;
  readonly tamanho: string | null;
  readonly tipoPedra: string | null;
  readonly colecaoPedra: string | null;
  readonly referenciaFornecedor: string | null;
  readonly descricaoEtiqueta: string | null;
  readonly pesoGramas: number | null;
  readonly unidade: string;
  readonly valorCompra: number | null;
  readonly valorCusto: number | null;
  readonly margemPercentual: number | null;
  readonly valorVenda: number;
  readonly observacao: string | null;
  readonly fotoUrl: string | null;
  readonly fotoArquivoId: string | null;
  readonly ativo: boolean;
  readonly estoqueAtual: number;
  readonly posicoes: PosicaoDeEstoque[];
  readonly dataEntradaEstoque: Date | null;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: ProdutoProps) {
    this.idErp = props.idErp ?? null;
    this.id = props.id;
    this.codigoErp = props.codigoErp;
    this.categoria = props.categoria;
    this.familia = props.familia;
    this.colecao = props.colecao ?? null;
    this.cor = props.cor ?? null;
    this.tamanho = props.tamanho ?? null;
    this.tipoPedra = props.tipoPedra ?? null;
    this.colecaoPedra = props.colecaoPedra ?? null;
    this.referenciaFornecedor = props.referenciaFornecedor ?? null;
    this.descricaoEtiqueta = props.descricaoEtiqueta ?? null;
    this.pesoGramas = props.pesoGramas ?? null;
    this.unidade = props.unidade;
    this.valorCompra = props.valorCompra ?? null;
    this.valorCusto = props.valorCusto ?? null;
    this.margemPercentual = props.margemPercentual ?? null;
    this.valorVenda = props.valorVenda;
    this.observacao = props.observacao ?? null;
    this.fotoUrl = props.fotoUrl ?? null;
    this.fotoArquivoId = props.fotoArquivoId ?? null;
    this.ativo = props.ativo;
    this.estoqueAtual = props.estoqueAtual ?? 0;
    this.posicoes = props.posicoes ?? [];
    this.dataEntradaEstoque = props.dataEntradaEstoque ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: ProdutoProps): Produto {
    return new Produto(props);
  }

  /**
   * A peca como ela sai pela API — 28/09/2026.
   *
   * ==========================================================================
   * O CAMPO NAO VAI NULO: ELE NAO EXISTE NO OBJETO.
   *
   * Requisito RN-01(a): "o campo nao deve vir no JSON para o perfil sem
   * permissao; nao basta vir nulo na tela". A diferenca nao e formalidade —
   * `valorCusto: null` ainda conta quantas pecas nao tem custo, e
   * `estoqueAtual: null` num item e `estoqueAtual: 3` no outro entrega quais
   * pecas tem saldo. Campo ausente nao responde nada disso.
   *
   * ATE 28/09/2026 O CONTROLLER DEVOLVIA A ENTIDADE CRUA, e por isso
   * `valorCusto`, `valorCompra`, `margemPercentual` e `estoqueAtual` viajavam
   * para qualquer um com `produtos:read` — inclusive o papel VENDEDORA, que
   * tem essa permissao. O canal de WhatsApp dela ja estava fechado desde
   * 25/09; o painel nunca tinha sido tocado.
   * ==========================================================================
   *
   * AS POSICOES SAEM JUNTO COM A QUANTIDADE. Cada uma carrega um numero, e
   * `posicoes.reduce(...)` reconstroi o `estoqueAtual` que acabamos de tirar —
   * esconder um e deixar o outro nao esconde nada. Sem permissao, sobra o
   * ONDE a peca esta (empresa, local, grupo), que e o que a tela usa para
   * filtrar, sem o QUANTO.
   */
  toPublic(opcoes: OpcoesDeExibicao = {}): Record<string, unknown> {
    const { custo = false, quantidade = false } = opcoes;

    return {
      id: this.id,
      idErp: this.idErp,
      codigoErp: this.codigoErp,
      categoria: this.categoria,
      familia: this.familia,
      colecao: this.colecao,
      cor: this.cor,
      tamanho: this.tamanho,
      tipoPedra: this.tipoPedra,
      colecaoPedra: this.colecaoPedra,
      referenciaFornecedor: this.referenciaFornecedor,
      descricaoEtiqueta: this.descricaoEtiqueta,
      pesoGramas: this.pesoGramas,
      unidade: this.unidade,
      // O preco de VENDA nao entra na regra: a matriz de permissoes o libera
      // para todos os perfis, e sem ele a vendedora nao atende ninguem.
      valorVenda: this.valorVenda,
      observacao: this.observacao,
      fotoUrl: this.fotoUrl,
      fotoArquivoId: this.fotoArquivoId,
      ativo: this.ativo,
      dataEntradaEstoque: this.dataEntradaEstoque,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,

      // ------------------------------------------------------------------
      // A PARTIR DAQUI, SO COM PERMISSAO. O espalhamento condicional e o que
      // faz a chave DESAPARECER — um `campo: undefined` some do `JSON
      // .stringify`, mas continua existindo no objeto e vaza em qualquer
      // codigo que faca `Object.keys` ou `in`.
      // ------------------------------------------------------------------
      ...(custo
        ? {
            valorCompra: this.valorCompra,
            valorCusto: this.valorCusto,
            // A MARGEM E CUSTO DISFARCADO: ela e o multiplicador aplicado
            // sobre o custo (1,50 a 4,50 na base), entao `valorVenda /
            // margemPercentual` devolve o custo com uma divisao. Liberar a
            // margem e liberar o custo pela porta dos fundos.
            margemPercentual: this.margemPercentual,
          }
        : {}),

      ...(quantidade
        ? { estoqueAtual: this.estoqueAtual, posicoes: this.posicoes }
        : {
            // A peca serve para atender, ou nao. E o mesmo contrato que o
            // canal da vendedora no WhatsApp ja usa desde 25/09 — ver
            // `ConsultarProdutosVendedoraUseCase`.
            disponivel: this.estoqueAtual > 0,
            // ==============================================================
            // SO AS POSICOES COM SALDO, E SEM O NUMERO.
            //
            // O ONDE fica, o QUANTO sai. Nao e meio-termo: e o que o
            // requisito P-03 exige — "a vendedora de Fortaleza pode vender
            // uma peca de SP, entao tem que saber se tem em estoque e o
            // preco". Sem saber ONDE a peca esta, ela nao tem essa resposta.
            //
            // AS ZERADAS SAEM JUNTO COM O NUMERO, e e aqui que estaria o
            // vazamento se eu tivesse mandado todas: a carga do integrador
            // cria uma linha zerada para quase toda peca em quase todo lugar,
            // entao a lista completa SEM quantidade nao distingue onde ha
            // saldo de onde nao ha. Filtrando por `> 0`, a presenca da linha
            // e a propria resposta — e nenhuma delas carrega numero.
            // ==============================================================
            posicoes: this.posicoes
              .filter((p) => p.quantidade > 0)
              .map((p) => ({
                empresa: p.empresa,
                local: p.local,
                grupo: p.grupo,
              })),
          }),
    };
  }
}

/**
 * O que este usuario pode enxergar da peca. Resolvido pelo
 * `EscopoProdutosService`, a partir das permissoes do papel.
 *
 * AMBOS SAO `false` POR PADRAO, e isso e a regra RN-03 (negar por padrao) em
 * forma de codigo: quem esquecer de passar as opcoes entrega a versao
 * RESTRITA. Um esquecimento tira um campo da tela; o padrao contrario
 * entregaria custo para quem nao pode ve-lo, e sem nada acusando.
 */
export interface OpcoesDeExibicao {
  /** `produtos:custo` — preco de compra, custo e a margem. */
  custo?: boolean;
  /** `estoque:quantidade` — o saldo por peca e por posicao. */
  quantidade?: boolean;
}
