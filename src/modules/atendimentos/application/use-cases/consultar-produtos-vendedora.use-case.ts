import { Injectable } from '@nestjs/common';
import { categoriaDaBusca } from '../../../../shared/catalogo/categorias';
import {
  FotosDeProdutoService,
  type FotoDeProduto,
} from '../fotos-de-produto.service';
import {
  faixaDePreco,
  type Faixa,
} from '../../../../shared/catalogo/faixa-de-preco';
import { ListarProdutosUseCase } from '../../../produtos/application/use-cases/listar-produtos.use-case';

/**
 * Teto de resultados, e agora com como pedir o resto.
 *
 * 6 ATE 07/10, DEPOIS 20, E ENTAO 10 — NO MESMO DIA, e as duas mudancas
 * tiveram motivo medido.
 *
 * Seis era pouco para uma tabela de preco, e era um teto do qual nao se saia.
 * Mas com vinte a agente fez pior: anunciou "aqui os 20 primeiros" e listou
 * DEZ. E isso nao e estetica — a continuacao e `a_partir_de = 20`, entao as
 * pecas 11 a 20 desapareceriam entre uma pagina e outra, sem ninguem ver.
 *
 * Dez e o tamanho que ela ja escolheu sozinha para uma lista de WhatsApp. O
 * texto do despacho manda listar TODAS, e o teto garante que "todas" caiba.
 */
const MAXIMO = 10;

/**
 * Quantas pecas conferir na Conexa quando ela pede so as que tem foto.
 *
 * O servico tem o proprio teto (250); este e o do SQL, e existe para a
 * pergunta mais aberta nao arrastar o catalogo inteiro para a memoria.
 */
const TETO_DE_CANDIDATAS = 250;

/**
 * O que a vendedora ve de um produto.
 *
 * REPARE NO QUE NAO EXISTE AQUI: `valorCusto`, `margemPercentual` — e, desde
 * 25/09/2026, A QUANTIDADE.
 *
 * Nao e omissao do prompt: e ausencia de campo. Como o objeto nao carrega,
 * nenhuma instrucao no meio da conversa faz o modelo revelar o que ele nunca
 * recebeu. Foi assim que custo e margem ficaram de fora em 20/08, e e assim
 * que a quantidade fica agora.
 *
 * ==========================================================================
 * ELA SABE SE TEM, E NAO QUANTO TEM — decisao do Lucas em 25/09/2026.
 *
 *   1  CO25413  COLAR RIVCOROA 16.92 CTS   disponivel     R$ 222.530,00
 *   2  BR26278  BRINCO DTS 1.37 CTS        indisponivel   R$  98.040,00
 *
 * A vendedora precisa responder "tenho essa peca para te mostrar?" — e para
 * isso um booleano basta. Saber que restam duas ou onze e informacao de
 * gestao, e no WhatsApp ela viaja para fora da loja com a mesma facilidade
 * com que chega.
 *
 * O CANAL DO CATALOGO (estoque/marketing) segue a MESMA regra, pela mesma
 * decisao — ver `fichaDaPeca` em `ProcessarFotoCatalogoUseCase`.
 * ==========================================================================
 */
export interface ProdutoParaVendedora {
  descricao: string;
  categoria: string;
  familia: string;
  codigo: string | null;
  precoVenda: number;
  /** Tem saldo na loja? O QUANTO nao sai daqui. */
  disponivel: boolean;
  /** Onde a foto MORARIA. Ter URL nao e ter foto — ver `FotosDeProdutoService`. */
  fotoUrl: string | null;
}

/**
 * A amostra e o tamanho real do achado.
 *
 * `total` e quantas o filtro acha de verdade; `produtos` sao as primeiras.
 * `semEstoque` e quantas EXISTEM no catalogo e ficaram de fora por nao ter
 * saldo — sem esse numero, "nao achei nenhuma" e mentira quando o que houve
 * foi "achei 22, todas zeradas".
 */
export interface ResultadoDeProdutos {
  produtos: ProdutoParaVendedora[];
  total: number;
  semEstoque: number;
  /** A lista JA traz as zeradas? Muda o que a agente tem de dizer. */
  incluiuSemEstoque: boolean;
  /** Em que categoria a lista esta. `undefined` = sem recorte. */
  categoria?: string;
  /** Quantas casam com o termo e ficaram FORA por causa da categoria. */
  foraDaCategoria: number;
  /** A faixa de preco efetivamente aplicada, ja lida e corrigida. */
  faixa: Faixa;
  /** Quantas foram puladas antes desta pagina. */
  pulados: number;
  /** As fotos que existem de verdade, ja baixadas. */
  fotos: FotoDeProduto[];
  /** Quantas da lista tinham URL cadastrada — nem toda URL vira foto. */
  tinhamFoto: number;
  /** A lista inteira e so de pecas COM foto conferida? */
  soComFoto?: boolean;
  /** Candidatas que ficaram sem conferir por causa do teto. */
  naoConferidas?: number;
}

/** O que a pergunta pode recortar. Objeto, e nao argumentos soltos: sao seis. */
export interface OpcoesDeBusca {
  incluirSemEstoque?: boolean;
  /** Vinda da pergunta; passa por `categoriaDaBusca` antes de virar filtro. */
  categoria?: string;
  /** Vindos da pergunta; passam por `faixaDePreco` — podem ser texto. */
  precoDe?: unknown;
  precoAte?: unknown;
  /** A pagina seguinte: quantas pular. */
  aPartirDe?: number;
  /** A foto vem junto, salvo quando ela pede so o texto. Padrao: vem. */
  comFoto?: boolean;
  /**
   * So as pecas que TEM foto de verdade — conferida na Conexa, e nao
   * presumida pela URL. Muda a LISTA, e nao so o anexo.
   */
  soComFoto?: boolean;
}

/**
 * Consulta de catalogo pela vendedora, no canal interno.
 *
 * Esta e a unica ferramenta do canal que NAO e restrita a ela: catalogo e da
 * loja, nao da carteira. O escopo aqui nao e por pessoa, e por CAMPO — o que
 * sai do banco e maior do que o que sai deste use case.
 */
@Injectable()
export class ConsultarProdutosVendedoraUseCase {
  constructor(
    private readonly listar: ListarProdutosUseCase,
    private readonly fotos: FotosDeProdutoService,
  ) {}

  /**
   * `incluirSemEstoque` e a excecao que a gestao pediu em 07/10: a lista e so
   * do que da para vender, A NAO SER que ela pergunte pelo indisponivel. Quem
   * decide e a pergunta dela, nao o sistema.
   *
   * E volta AMOSTRA + TOTAL, nunca um array solto — a licao da carteira em
   * 21/08/2026, reaprendida no mesmo dia: sem o total, o modelo trata as seis
   * do teto como se fossem o catalogo.
   */
  async execute(
    busca: string,
    opcoes: OpcoesDeBusca = {},
  ): Promise<ResultadoDeProdutos> {
    const incluirSemEstoque = opcoes.incluirSemEstoque === true;
    const comFoto = opcoes.comFoto !== false;
    const categoria = categoriaDaBusca(opcoes.categoria);
    const faixa = faixaDePreco(opcoes.precoDe, opcoes.precoAte);
    const pulados = Math.max(0, Math.trunc(opcoes.aPartirDe ?? 0));
    const filtro = {
      busca,
      ativo: true,
      apenasDisponiveis: !incluirSemEstoque,
      categoriaSugerida: categoria,
      precoDe: faixa.de,
      precoAte: faixa.ate,
    };

    // AS DUAS CONTAGENS SEMPRE, e isto foi corrigido no segundo teste de
    // 07/10. Zerar o `semEstoque` quando ela PEDE o indisponivel parecia
    // obvio — nao ha o que "ficar de fora" — e deixou a agente sem o numero
    // justamente na pergunta que era sobre ele:
    //
    //   — "tem alguma esmeralda sem estoque?"
    //   — "As 6 primeiras que apareceram estao todas com estoque, mas sao 112
    //      no total — nao da para afirmar que nenhuma zerou so por essas."
    //
    // Sao 103 zeradas. Ela tinha as 112 e nao tinha o 103.
    // ======================================================================
    // "MONTA UMA TABELA ATE 50 MIL, AS QUE TIVEREM FOTOS" — 07/10/2026.
    //
    // A existencia da foto NAO esta no banco: esta na Conexa. Entao o filtro
    // tem duas etapas — o SQL tira quem nem URL tem, e o `HEAD` diz quais
    // URLs respondem. E so depois disso da para paginar, porque a pagina e
    // da lista JA conferida: paginar antes mostraria "10 primeiras" de uma
    // lista onde nove nao tem foto.
    //
    // Medido: das 200 joias com saldo ate 50 mil, 169 tem URL e 41 tem foto;
    // conferir as 169 leva 4,3s, com memoria de seis horas por URL.
    // ======================================================================
    if (opcoes.soComFoto) {
      return this.soAsQueTemFoto(filtro, pulados, categoria, faixa);
    }

    const [produtos, total, comSaldo] = await Promise.all([
      this.listar.execute({ ...filtro, limit: MAXIMO, deslocamento: pulados }),
      this.listar.contar(filtro),
      this.listar.contar({ ...filtro, apenasDisponiveis: true }),
    ]);
    const [noCatalogo, semRecorte] = await Promise.all([
      incluirSemEstoque
        ? Promise.resolve(total)
        : this.listar.contar({ ...filtro, apenasDisponiveis: false }),
      // QUANTAS A CATEGORIA ESCONDEU. Sem este numero, o padrao JEWEL some
      // uma decoracao sem dizer que sumiu — e seria o mesmo erro do teto sem
      // total, so que com outro nome.
      categoria
        ? this.listar.contar({ ...filtro, categoriaSugerida: undefined })
        : Promise.resolve(total),
    ]);

    const linhas = produtos.map((p) => ({
      descricao: p.descricaoEtiqueta ?? `${p.categoria} ${p.familia}`,
      categoria: p.categoria,
      familia: p.familia,
      codigo: p.codigoErp,
      precoVenda: p.valorVenda,
      // O saldo vem da tabela `estoque` (ver `saldo-do-produto.ts`), e vira
      // um SIM ou NAO aqui — o numero nao atravessa esta fronteira.
      disponivel: p.estoqueAtual > 0,
      fotoUrl: p.fotoUrl ?? null,
    }));

    // AS FOTOS SAO BAIXADAS AQUI, antes de o modelo escrever — e nao depois.
    // So quem baixou sabe quais das URLs respondem de verdade (metade da
    // joia nao responde), e a agente precisa desse numero para nao prometer
    // o que nao vai mandar.
    const { fotos, tinhamUrl } = comFoto
      ? await this.fotos.buscar(
          linhas.map((l) => ({
            codigo: l.codigo ?? '',
            url: l.fotoUrl,
            legenda: `${l.descricao}${l.codigo ? ` — ${l.codigo}` : ''}`,
          })),
        )
      : { fotos: [], tinhamUrl: 0 };

    return {
      produtos: linhas,
      total,
      semEstoque: Math.max(0, noCatalogo - comSaldo),
      incluiuSemEstoque: incluirSemEstoque,
      categoria,
      foraDaCategoria: Math.max(0, semRecorte - total),
      faixa,
      pulados,
      fotos,
      tinhamFoto: tinhamUrl,
    };
  }

  /**
   * A lista de quem TEM foto, conferida peça a peça na Conexa.
   *
   * A paginação é da lista JÁ conferida — e tem de ser. Paginar antes traria
   * "as 10 primeiras" de um conjunto onde nove não têm foto, que foi
   * exatamente a resposta que a agente deu em 07/10 quando o filtro ainda
   * não existia.
   */
  private async soAsQueTemFoto(
    filtro: {
      busca: string;
      ativo: boolean;
      apenasDisponiveis: boolean;
      categoriaSugerida?: string;
      precoDe?: number;
      precoAte?: number;
    },
    pulados: number,
    categoria: string | undefined,
    faixa: Faixa,
  ): Promise<ResultadoDeProdutos> {
    const candidatas = await this.listar.execute({
      ...filtro,
      comFotoCadastrada: true,
      limit: TETO_DE_CANDIDATAS,
    });

    const { comFoto: confirmadas, cortadas } = await this.fotos.quaisTemFoto(
      candidatas.map((p) => ({
        codigo: p.codigoErp ?? p.id ?? '',
        url: p.fotoUrl ?? null,
        legenda: '',
      })),
    );

    const porCodigo = new Map(
      candidatas.map((p) => [p.codigoErp ?? p.id ?? '', p]),
    );
    const todas = confirmadas
      .map((c) => porCodigo.get(c.codigo))
      .filter((p): p is NonNullable<typeof p> => !!p);
    const pagina = todas.slice(pulados, pulados + MAXIMO);

    const linhas = pagina.map((p) => ({
      descricao: p.descricaoEtiqueta ?? `${p.categoria} ${p.familia}`,
      categoria: p.categoria,
      familia: p.familia,
      codigo: p.codigoErp,
      precoVenda: p.valorVenda,
      disponivel: p.estoqueAtual > 0,
      fotoUrl: p.fotoUrl ?? null,
    }));

    // `true`: ela FILTROU por foto, então a página inteira vai com imagem —
    // ver `TETO_QUANDO_ELA_PEDIU`.
    const { fotos } = await this.fotos.buscar(
      linhas.map((l) => ({
        codigo: l.codigo ?? '',
        url: l.fotoUrl,
        legenda: `${l.descricao}${l.codigo ? ` — ${l.codigo}` : ''}`,
      })),
      true,
    );

    return {
      produtos: linhas,
      total: todas.length,
      // Aqui `semEstoque` não é o que o saldo escondeu, e sim o que a FOTO
      // escondeu: candidatas com URL que a Conexa não respondeu. O texto do
      // despacho trata os dois casos separados — ver `soComFoto`.
      semEstoque: 0,
      incluiuSemEstoque: false,
      categoria,
      foraDaCategoria: 0,
      faixa,
      pulados,
      fotos,
      tinhamFoto: candidatas.length,
      soComFoto: true,
      naoConferidas: cortadas,
    };
  }
}
