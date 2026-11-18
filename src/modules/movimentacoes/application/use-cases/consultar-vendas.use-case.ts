import { Inject, Injectable } from '@nestjs/common';
import {
  SEM_TIPO,
  ehJoia,
  metalDaCor,
  metalDaEtiqueta,
  pedraDoTermo,
  PEDRAS,
  pedrasDaPeca,
  prefixosDoTipo,
  tipoDaPeca,
} from '../../../../shared/catalogo/sinonimos';
import { TETO_DE_LISTA } from '../../../../shared/limites/teto-de-lista';
import {
  VENDAS_MOVIMENTACAO_REPOSITORY,
  type ConsignacoesDoPeriodo,
  type ItemMaisVendido,
  type FiltroVendasDetalhadas,
  type IVendasMovimentacaoRepository,
  type VendaDetalhada,
  type VendasDeUmaEmpresa,
  type JanelaDeVendas,
  type FaixaDeValor,
  type PecasNaFaixa,
  type ResumoDeVendas,
  type VendasPorCor,
  type VendedoraNoRanking,
} from '../../domain/ports/repositories/vendas-movimentacao-repository.port';

/**
 * O recorte que a gestao pede em palavras.
 *
 * `HOJE` e o padrao — decisao do Lucas em 25/09. Vale saber que ele vem vazio
 * com frequencia: em 2026 a loja teve venda em **12 dias por mes**, em media.
 * Por isso quem responde mostra o mes junto quando o dia esta zerado; ver
 * `ConsultarVendasUseCase.resumo`.
 */
/**
 * O ROTULO DE QUEM NAO TEM METAL NO CADASTRO — 16/11/2026.
 *
 * E "sem classificacao", e NUNCA "outros metais": medido em 16/11, das 181
 * pecas de 2026 que caem aqui, 129 sao vaso e vela da categoria HOME e 40
 * sao roupa da AT WEAR. Chamar isso de metal seria mentira.
 *
 * So SEIS sao joia de verdade sem metal no cadastro.
 */
export const SEM_METAL = 'Sem classificação de metal';

/** Uma linha da quebra por metal. O nome ja vem pronto para a conversa. */
export interface VendasDeUmMetal {
  metal: string;
  quantidade: number;
  valor: number;
}

/** Uma linha da quebra por tipo de peça. O nome já vem pronto para a conversa. */
export interface VendasDeUmTipo {
  tipo: string;
  quantidade: number;
  valor: number;
  /** Zero quando não se pediu comparação. */
  quantidadeAnterior: number;
  joia: boolean;
}

export interface QuebraPorTipo {
  linhas: VendasDeUmTipo[];
  /**
   * A JOIA É UM CONJUNTO DE TIPOS, e não a categoria `JEWEL`: o colar da
   * COLLAB é colar e entra; o vaso da HOME não.
   */
  totalDeJoia: number;
  totalDeJoiaAnterior: number;
  comparando: boolean;
  /**
   * O ANO DE CADA LADO — 16/11/2026, pedido do Lucas no teste local:
   * *"seria interessante trazer o ano.. aqui eu me perdi e não sei quem é
   * quem"*.
   *
   * A agente reescreve a resposta inteira ao repassar, e só os NÚMEROS
   * sobrevivem intactos. Então o ano viaja na LINHA, e não num cabeçalho
   * que ela parafraseia.
   *
   * `null` quando não se está comparando.
   */
  ano: string | null;
  anoAnterior: string | null;
  /** O recorte consultado, por extenso. Ver `rotuloDoPeriodo`. */
  periodo: string;
}

/** Uma linha da quebra por pedra. */
export interface VendasDeUmaPedra {
  pedra: string;
  quantidade: number;
  valor: number;
  /** Zero quando não se pediu comparação. */
  quantidadeAnterior: number;
}

/** Uma vendedora no ranking de uma pedra. */
export interface VendedoraComPedra {
  nome: string;
  quantidade: number;
  valor: number;
}

/**
 * O RANKING DE UMA PEDRA — 16/11/2026.
 *
 * `PEDRA_DESCONHECIDA` não é erro: é a resposta para "quem vendeu mais
 * brilhante?", e vem com a lista para quem chama perguntar qual. É o mesmo
 * desenho do `FAMILIA_DESCONHECIDA` do `quem_mais_vende`.
 */
export interface RankingDePedra {
  status: 'OK' | 'PEDRA_DESCONHECIDA';
  pedra: string | null;
  linhas: VendedoraComPedra[];
  pedras: string[];
  /** O recorte consultado, por extenso. Ver `rotuloDoPeriodo`. */
  periodo: string;
}

export interface QuebraPorPedra {
  linhas: VendasDeUmaPedra[];
  /** A SOMA DAS LINHAS PASSA DESTE NÚMERO: peça com duas pedras conta nas duas. */
  pecasComPedra: number;
  pecasSemPedra: number;
  comparando: boolean;
  /** Ver o mesmo campo em `QuebraPorTipo`: o ano anda junto do número. */
  ano: string | null;
  anoAnterior: string | null;
  /** O recorte consultado, por extenso. Ver `rotuloDoPeriodo`. */
  periodo: string;
}

/**
 * A quebra por metal, com o recorte que ela consultou.
 *
 * O `periodo` ENTROU EM 16/11 junto com os irmaos: uma resposta vazia que nao
 * diz de quando convida o modelo a inventar o recorte, e foi o que aconteceu
 * com a pergunta da perola.
 */
export interface QuebraPorMetal {
  linhas: VendasDeUmMetal[];
  periodo: string;
}

/**
 * O VALOR DAS VENDAS, SEM A LISTA — 17/11/2026.
 *
 * ==========================================================================
 * OS DOIS LADOS VIAJAM JUNTOS, E ISSO NAO E ZELO.
 *
 * Na conversa da gestao de 16/11 sairam R$ 1.837.916,80 (a lista) e
 * R$ 1.815.870,80 ("o total da equipe") no mesmo mes, com R$ 22.046 de
 * diferenca — porque a lista NAO desconta devolucao e o resumo desconta. Ela
 * nao tinha como saber qual era qual.
 *
 * Entregar um numero so faria a ferramenta nova discordar da lista na mesma
 * conversa, e a culpa pareceria ser do numero.
 * ==========================================================================
 */
export interface ValorDasVendas {
  quantidade: number;
  /** O que a LISTA mostra: soma das saidas, sem abater devolucao. */
  bruto: number;
  devolucoes: number;
  valorDevolvido: number;
  /** Ja descontada a devolucao — e o que o resumo sempre respondeu. */
  receita: number;
  ticketMedio: number;
  clientes: number;
  periodo: string;
}
export type RecorteDeVendas = 'HOJE' | 'ONTEM' | 'SEMANA' | 'MES' | 'ANO';

/** Quantos itens o ranking devolve quando ninguem pede outro numero. */
export const LIMITE_PADRAO = 10;
/**
 * Teto de quem PEDE um teto baixo de proposito — o panorama da equipe passa
 * este valor para nao cortar ninguem de uma equipe de dez.
 *
 * JA NAO E O PADRAO do `limitar`: ver a nota dele. Como padrao, era corte
 * silencioso.
 */
export const LIMITE_MAXIMO = 30;
/**
 * O TETO DE QUEM ALIMENTA O ARQUIVO — 27/10/2026.
 *
 * ==========================================================================
 * "LISTA MAIOR QUE ISTO NAO SE LE NO WHATSAPP" vale para a CONVERSA, e desde
 * 20/10 a mesma consulta alimenta o PDF — que nao se le no WhatsApp.
 *
 * O `detalhadas` passou a pedir 500 naquele dia para o arquivo levar a lista
 * inteira; o `limitar` cortava em 30 sem dizer nada. Entao o PDF das "43
 * vendas de 2026" saiu com TRINTA, e o numero certo estava escrito na
 * conversa logo acima dele. Medido em 27/10 pelo
 * `scripts/conferir-duas-janelas.ts`.
 *
 * Quem corta para a conversa e quem responde (`MAXIMO_VENDAS_DETALHADAS`),
 * e nao a consulta: so o arquivo precisa do resto.
 * ==========================================================================
 */
// SUBIU EM 28/10/2026, junto dos outros tres tetos da casa: 500 cortava as
// 1.110 vendas da AT JEWEL LTDA. Ver `shared/limites/teto-de-lista`.
export const LIMITE_DO_ARQUIVO = TETO_DE_LISTA;

export interface ResumoComRecorte extends ResumoDeVendas {
  /** O periodo efetivamente consultado, para quem responde poder dize-lo. */
  de: Date;
  ate: Date;
  /**
   * Presente SO quando o recorte pedido foi `HOJE` e o dia esta zerado. E o
   * que impede a resposta de virar um beco sem saida.
   */
  mes?: ResumoDeVendas;
}

/**
 * Tudo que se pergunta sobre venda, lido da MOVIMENTACAO.
 *
 * Ver `vendas-movimentacao-repository.port.ts` para a decisao de 25/09 que
 * tirou a tabela `vendas` do caminho.
 */
@Injectable()
export class ConsultarVendasUseCase {
  constructor(
    @Inject(VENDAS_MOVIMENTACAO_REPOSITORY)
    private readonly vendas: IVendasMovimentacaoRepository,
  ) {}

  async resumo(
    recorte: RecorteDeVendas = 'HOJE',
    vendedoraId?: string | null,
    agora: Date = new Date(),
  ): Promise<ResumoComRecorte> {
    const janela = janelaDe(recorte, agora);
    const resumo = await this.vendas.resumo(janela, vendedoraId);

    // O DIA VAZIO NAO PODE SER O FIM DA CONVERSA. Com venda em 12 dias por mes,
    // "hoje nao houve venda" e a resposta mais provavel — e sozinha ela parece
    // defeito. O mes vai junto para a frase ter para onde ir.
    if (recorte === 'HOJE' && resumo.quantidade === 0) {
      const mes = await this.vendas.resumo(janelaDe('MES', agora), vendedoraId);
      return { ...resumo, ...janela, mes };
    }

    return { ...resumo, ...janela };
  }

  async ranking(
    recorte: RecorteDeVendas = 'HOJE',
    limite = LIMITE_PADRAO,
    agora: Date = new Date(),
  ): Promise<{ linhas: VendedoraNoRanking[]; de: Date; ate: Date }> {
    const janela = janelaDe(recorte, agora);
    const linhas = await this.vendas.rankingDeVendedoras(
      janela,
      limitar(limite),
    );
    return { linhas, ...janela };
  }

  /**
   * AS PECAS VENDIDAS NUMA FAIXA DE VALOR — 13/10/2026.
   *
   * ========================================================================
   * FAIXA VAZIA NAO CONSULTA, E ISSO E A REGRA.
   *
   * Sem minimo e sem maximo, a "faixa" e o historico inteiro — e a resposta
   * seria "2.037 pecas", verdadeira e inutil, apresentada como se alguem
   * tivesse perguntado isso. O modelo escreve estes campos; quando ele
   * esquecer os dois, a resposta honesta e pedir o valor, nao inventar um.
   * ========================================================================
   *
   * A JANELA VEM PRONTA de quem chama — por atalho (`ANO`) ou por datas que o
   * modelo converteu ("primeiro trimestre de 2025"). Aqui nao se interpreta
   * periodo: isso e do `datasDeRecorte`, que ja serve as duas agentes.
   */
  async pecasPorFaixa(opcoes: {
    janela: JanelaDeVendas;
    faixa: FaixaDeValor;
    limite?: number;
    deslocamento?: number;
    vendedoraId?: string | null;
  }): Promise<(PecasNaFaixa & { deslocamento: number }) | null> {
    const { minimo, maximo } = opcoes.faixa;
    if (minimo === undefined && maximo === undefined) return null;
    // Invertida devolveria vazio EM SILENCIO — o mesmo erro que o
    // `datasDeRecorte` recusa nas datas.
    if (minimo !== undefined && maximo !== undefined && minimo > maximo) {
      return null;
    }

    const deslocamento = opcoes.deslocamento ?? 0;
    const r = await this.vendas.pecasPorFaixaDeValor(
      opcoes.janela,
      opcoes.faixa,
      // O TETO DO ARQUIVO VALE AQUI TAMBEM — 28/10/2026.
      //
      // Era `limitar(limite ?? 10)`, e o `limitar` corta em 30: pedir o teto
      // da casa devolvia TRINTA pecas, calado. E o mesmo defeito que o
      // `detalhadas` tinha em 27/10, no outro metodo. Medido: uma faixa ampla
      // em 2026 tem 582 pecas, e a conversa mostrava dez.
      limitar(opcoes.limite ?? LIMITE_PADRAO, LIMITE_DO_ARQUIVO),
      deslocamento,
      opcoes.vendedoraId,
    );
    return { ...r, deslocamento };
  }

  async itens(
    recorte: RecorteDeVendas = 'HOJE',
    limite = LIMITE_PADRAO,
    vendedoraId?: string | null,
    agora: Date = new Date(),
  ): Promise<{ linhas: ItemMaisVendido[]; de: Date; ate: Date }> {
    const janela = janelaDe(recorte, agora);
    const linhas = await this.vendas.itensMaisVendidos(
      janela,
      limitar(limite),
      vendedoraId,
    );
    return { linhas, ...janela };
  }

  /**
   * AS VENDAS UMA A UMA — 02/10/2026.
   *
   * O recorte vem pronto de quem conversa: cliente, vendedora, documento e
   * janela ja resolvidos. Aqui so se monta a janela quando ela veio como
   * ATALHO ("setembro", "este mes"); com datas soltas, quem chamou ja passou o
   * intervalo.
   *
   * SEM JANELA E LEGITIMO: "quais as compras da cliente 00376" e sobre a vida
   * inteira dela, nao sobre um mes.
   */
  async detalhadas(
    filtro: Omit<FiltroVendasDetalhadas, 'janela'> & {
      recorte?: RecorteDeVendas;
      de?: Date;
      ate?: Date;
    },
    limite = LIMITE_PADRAO,
    agora: Date = new Date(),
  ): Promise<{ vendas: VendaDetalhada[]; total: number }> {
    const janela =
      filtro.de && filtro.ate
        ? fimDoDia({ de: filtro.de, ate: filtro.ate })
        : filtro.recorte
          ? janelaDe(filtro.recorte, agora)
          : undefined;

    return this.vendas.listarDetalhadas(
      {
        janela,
        clienteId: filtro.clienteId,
        vendedoraId: filtro.vendedoraId,
        empresaId: filtro.empresaId,
        documento: filtro.documento,
        status: filtro.status,
      },
      // O ARQUIVO LEVA TODAS — ver `LIMITE_DO_ARQUIVO`. Quem corta as dez
      // da conversa e quem responde.
      limitar(limite, LIMITE_DO_ARQUIVO),
    );
  }

  /**
   * O faturamento de cada empresa do grupo — 02/10/2026.
   *
   * SEM RECORTE E A VIDA INTEIRA de cada uma, que e como a pergunta costuma
   * vir ("qual o faturamento da MP?").
   */
  async porEmpresa(
    recorte?: RecorteDeVendas,
    de?: Date,
    ate?: Date,
    agora: Date = new Date(),
  ): Promise<VendasDeUmaEmpresa[]> {
    const janela =
      de && ate
        ? fimDoDia({ de, ate })
        : recorte
          ? janelaDe(recorte, agora)
          : undefined;

    return this.vendas.receitaPorEmpresa(janela);
  }

  /**
   * AS VENDAS QUEBRADAS POR TIPO DE OURO — 16/11/2026.
   *
   * Nasceu de uma pergunta da gestora que a agente nao sabia responder: o
   * dado estava na base e nenhuma ferramenta alcancava.
   *
   * SEM RECORTE E O HISTORICO INTEIRO, igual ao `porEmpresa` logo acima.
   *
   * A `cor` TEM PRECEDENCIA SOBRE A ETIQUETA: ela e campo de metal, a
   * etiqueta e texto livre. A etiqueta e a segunda fonte, e paga — das 166
   * pecas JEWEL sem `cor`, 53 nomeiam o metal ali.
   */
  async porMetal(
    recorte?: RecorteDeVendas,
    de?: Date,
    ate?: Date,
    agora: Date = new Date(),
    /**
     * O RECORTE DE VENDEDORAS — 17/11/2026, e ele vem POR ULTIMO de
     * proposito: assim nenhum chamador existente quebra.
     *
     * `null` e a loja, uma lista e exatamente aquelas, e `[]` e ninguem.
     * Quem decide e quem monta as ferramentas, nunca o modelo.
     */
    vendedoras: string[] | null = null,
  ): Promise<QuebraPorMetal> {
    const janela =
      de && ate
        ? fimDoDia({ de, ate })
        : recorte
          ? janelaDe(recorte, agora)
          : undefined;

    const cruas = await this.vendas.vendasPorMetal(janela, vendedoras);

    const porNome = new Map<string, VendasDeUmMetal>();
    for (const linha of cruas) {
      const metal = nomeDoMetal(linha);
      const atual = porNome.get(metal) ?? { metal, quantidade: 0, valor: 0 };
      // Number() DE NOVO, e nao e redundancia boba: o `pg` devolve NUMERIC
      // como texto, e somar texto CONCATENA em silencio.
      atual.quantidade += Number(linha.quantidade);
      atual.valor += Number(linha.valor);
      porNome.set(metal, atual);
    }

    return {
      linhas: [...porNome.values()]
        .filter((l) => l.quantidade > 0 || l.valor > 0)
        .sort(ordemDosMetais),
      periodo: rotuloDoPeriodo(janela),
    };
  }

  /**
   * "Valor das vendas desse mes" — 17/11/2026, e e diferente de "quais as
   * vendas desse mes".
   *
   * Sem recorte de vendedora, a unica saida era a lista, que imprime a tabela
   * como efeito de ser chamada. Esta devolve os numeros e nada mais.
   */
  async valorDasVendas(
    recorte?: RecorteDeVendas,
    de?: Date,
    ate?: Date,
    agora: Date = new Date(),
    /** Ver o recorte no `porMetal`. */
    vendedoras: string[] | null = null,
  ): Promise<ValorDasVendas> {
    const janela =
      de && ate ? fimDoDia({ de, ate }) : janelaDe(recorte ?? 'MES', agora);

    const r = await this.vendas.resumo(janela, null, vendedoras);

    return {
      quantidade: r.quantidade,
      // O BRUTO VOLTA PELA SOMA: o repositorio devolve a receita liquida e o
      // que foi devolvido, e o bruto e a soma dos dois. Nao ha consulta nova.
      bruto: r.receita + r.valorDevolvido,
      devolucoes: r.devolucoes,
      valorDevolvido: r.valorDevolvido,
      receita: r.receita,
      ticketMedio: r.ticketMedio,
      clientes: r.clientes,
      periodo: rotuloDoPeriodo(janela),
    };
  }

  /**
   * AS CONSIGNAÇÕES DO PERÍODO — 18/11/2026.
   *
   * ====================================================================
   * A PERGUNTA NASCEU DO CONSERTO, E NÃO APESAR DELE.
   *
   * Até 17/11 a consignação entrava no total de vendas, e por isso a
   * gestão nunca precisou perguntar por ela: já estava lá, errada. Tirá-la
   * do número abriu a pergunta legítima, e o Lucas a nomeou na hora —
   * *"quantas consignações tivemos no mês de novembro"* e *"quantas já
   * foram devolvidas"*.
   *
   * SÃO DOIS NÚMEROS QUE NÃO SE SUBTRAEM. Ver a porta.
   * ====================================================================
   */
  async consignacoes(
    recorte?: RecorteDeVendas,
    de?: Date,
    ate?: Date,
    agora: Date = new Date(),
    /** Ver o recorte no `porMetal`. */
    vendedoras: string[] | null = null,
  ): Promise<ConsignacoesDoPeriodo & { periodo: string }> {
    const janela =
      de && ate ? fimDoDia({ de, ate }) : janelaDe(recorte ?? 'MES', agora);

    const r = await this.vendas.consignacoes(janela, vendedoras);

    return { ...r, periodo: rotuloDoPeriodo(janela) };
  }

  /**
   * A QUEBRA POR TIPO DE PEÇA — 16/11/2026.
   *
   * ====================================================================
   * O TIPO NÃO VEM DA COLUNA `familia`, E ESSA É A CORREÇÃO.
   *
   * A `familia` guarda tipo e estilo misturados: RIVEIRA são 73 colares e
   * 17 pulseiras; SOLITARIO são 29 brincos, 13 colares, 8 anéis. Quem casa
   * por igualdade nela perde as peças de estilo — perguntada quantos
   * colares saíram em 2026, a agente respondia 108 em vez de 118.
   *
   * Quem nomeia o tipo é o dicionário (`tipoDaPeca`), e ele tem duas
   * pernas: prefixo do código dentro da joia, `familia` fora dela.
   * ====================================================================
   *
   * SEM RECORTE É O HISTÓRICO INTEIRO, igual ao `porMetal`.
   *
   * COM `compararAnoAnterior`, a janela do ano passado é montada AQUI, e é
   * o que garante o corte no mesmo dia nos dois anos.
   */
  async porTipo(
    recorte?: RecorteDeVendas,
    de?: Date,
    ate?: Date,
    compararAnoAnterior = false,
    agora: Date = new Date(),
    /** Ver o recorte no `porMetal`. */
    vendedoras: string[] | null = null,
  ): Promise<QuebraPorTipo> {
    const janela =
      de && ate
        ? fimDoDia({ de, ate })
        : recorte
          ? janelaDe(recorte, agora)
          : undefined;

    // SEM JANELA NÃO HÁ O QUE COMPARAR: "o histórico inteiro contra o
    // histórico inteiro do ano passado" não é pergunta.
    const anterior =
      compararAnoAnterior && janela ? umAnoAntes(janela) : undefined;

    const cruas = await this.vendas.vendasPorTipo(
      janela,
      anterior,
      vendedoras,
    );

    const porNome = new Map<string, VendasDeUmTipo>();
    for (const l of cruas) {
      const palavra = tipoDaPeca({
        categoria: l.categoria,
        codigoErp: l.codigoErp,
        familia: l.familia,
      });
      const tipo = comInicialMaiuscula(palavra);
      const atual = porNome.get(tipo) ?? {
        tipo,
        quantidade: 0,
        valor: 0,
        quantidadeAnterior: 0,
        joia: ehJoia(palavra),
      };
      // Number() DE NOVO: o `pg` devolve NUMERIC como texto, e somar texto
      // CONCATENA em silêncio.
      atual.quantidade += Number(l.quantidade);
      atual.valor += Number(l.valor);
      atual.quantidadeAnterior += Number(l.quantidadeAnterior);
      porNome.set(tipo, atual);
    }

    const linhas = [...porNome.values()]
      .filter(
        (l) => l.quantidade > 0 || l.quantidadeAnterior > 0 || l.valor > 0,
      )
      .sort(ordemDosTipos);

    const daJoia = linhas.filter((l) => l.joia);

    return {
      linhas,
      // O TOTAL SAI PRONTO, para o modelo não somar à mão.
      totalDeJoia: daJoia.reduce((s, l) => s + l.quantidade, 0),
      totalDeJoiaAnterior: daJoia.reduce(
        (s, l) => s + l.quantidadeAnterior,
        0,
      ),
      comparando: anterior !== undefined,
      ano: janela ? rotuloDoAno(janela) : null,
      anoAnterior: anterior ? rotuloDoAno(anterior) : null,
      periodo: rotuloDoPeriodo(janela),
    };
  }

  /**
   * A QUEBRA POR PEDRA — 16/11/2026.
   *
   * ====================================================================
   * UMA PEÇA COM DUAS PEDRAS CONTA NAS DUAS.
   *
   * É deliberado: a pergunta é "quanto saiu de esmeralda", e um colar com
   * esmeralda e diamante saiu com esmeralda. Em 2026 são 60 peças com duas
   * ou mais, e por isso a soma das linhas (404) passa do número de peças
   * com pedra (337).
   *
   * `pecasComPedra` E `pecasSemPedra` VIAJAM por causa disso: sem elas a
   * gestora soma as linhas, não fecha com o total de peças e conclui que o
   * número está errado. É o mesmo cuidado da linha "sem classificação de
   * metal".
   * ====================================================================
   */
  async porPedra(
    recorte?: RecorteDeVendas,
    de?: Date,
    ate?: Date,
    compararAnoAnterior = false,
    agora: Date = new Date(),
    /** Ver o recorte no `porMetal`. */
    vendedoras: string[] | null = null,
  ): Promise<QuebraPorPedra> {
    const janela =
      de && ate
        ? fimDoDia({ de, ate })
        : recorte
          ? janelaDe(recorte, agora)
          : undefined;
    const anterior =
      compararAnoAnterior && janela ? umAnoAntes(janela) : undefined;

    const cruas = await this.vendas.vendasPorPedra(
      janela,
      anterior,
      false,
      vendedoras,
    );

    const porNome = new Map<string, VendasDeUmaPedra>();
    let comPedra = 0;
    let semPedra = 0;

    for (const l of cruas) {
      const quantidade = Number(l.quantidade);
      const valor = Number(l.valor);
      const quantidadeAnterior = Number(l.quantidadeAnterior ?? 0);
      const pedras = pedrasDaPeca(l.tipoPedra, l.etiqueta);

      if (pedras.length === 0) {
        semPedra += quantidade;
        continue;
      }
      comPedra += quantidade;

      for (const bruta of pedras) {
        const pedra = comInicialMaiuscula(bruta);
        const atual = porNome.get(pedra) ?? {
          pedra,
          quantidade: 0,
          valor: 0,
          quantidadeAnterior: 0,
        };
        atual.quantidade += quantidade;
        atual.valor += valor;
        atual.quantidadeAnterior += quantidadeAnterior;
        porNome.set(pedra, atual);
      }
    }

    return {
      linhas: [...porNome.values()]
        .filter((l) => l.quantidade > 0 || l.quantidadeAnterior > 0)
        .sort(
          (a, b) =>
            Math.max(b.quantidade, b.quantidadeAnterior) -
              Math.max(a.quantidade, a.quantidadeAnterior) ||
            b.valor - a.valor,
        ),
      pecasComPedra: comPedra,
      pecasSemPedra: semPedra,
      comparando: anterior !== undefined,
      ano: janela ? rotuloDoAno(janela) : null,
      anoAnterior: anterior ? rotuloDoAno(anterior) : null,
      periodo: rotuloDoPeriodo(janela),
    };
  }

  /**
   * QUEM VENDEU MAIS UMA PEDRA — 16/11/2026, pedido do Lucas no teste local.
   *
   * ====================================================================
   * O FILTRO DA PEDRA ACONTECE AQUI, E NÃO NO SQL.
   *
   * A pedra não é coluna: ela sai do dicionário, lendo `tipo_pedra` e a
   * etiqueta. O banco traz a quebra por vendedora com as duas fontes cruas,
   * e a peneira é esta — a mesma leitura que a `ficha-da-peca` já usava.
   *
   * UMA PEÇA COM DUAS PEDRAS CONTA PARA A VENDEDORA NAS DUAS, pela mesma
   * razão da quebra: quem vendeu um colar de esmeralda e diamante vendeu os
   * dois.
   * ====================================================================
   */
  async quemVendeuPedra(
    termo: string,
    recorte?: RecorteDeVendas,
    de?: Date,
    ate?: Date,
    limite = LIMITE_PADRAO,
    agora: Date = new Date(),
    /** Ver o recorte no `porMetal`. */
    vendedoras: string[] | null = null,
  ): Promise<RankingDePedra> {
    const pedra = pedraDoTermo(termo);
    if (pedra === null) {
      // NEM CONSULTA O BANCO: o nome já não existe no dicionário.
      return {
        status: 'PEDRA_DESCONHECIDA',
        pedra: null,
        linhas: [],
        pedras: [...PEDRAS].sort(),
        periodo: rotuloDoPeriodo(undefined),
      };
    }

    const janela =
      de && ate
        ? fimDoDia({ de, ate })
        : recorte
          ? janelaDe(recorte, agora)
          : undefined;

    const cruas = await this.vendas.vendasPorPedra(
      janela,
      undefined,
      true,
      vendedoras,
    );

    const porVendedora = new Map<string, VendedoraComPedra>();
    for (const l of cruas) {
      // A movimentação sem vendedora existe — 2 em 1.414 — e não vira linha
      // num ranking de pessoas.
      if (!l.vendedoraId || !l.vendedora) continue;
      if (!pedrasDaPeca(l.tipoPedra, l.etiqueta).includes(pedra)) continue;

      const atual = porVendedora.get(l.vendedoraId) ?? {
        nome: l.vendedora,
        quantidade: 0,
        valor: 0,
      };
      atual.quantidade += Number(l.quantidade);
      atual.valor += Number(l.valor);
      porVendedora.set(l.vendedoraId, atual);
    }

    return {
      status: 'OK',
      pedra: comInicialMaiuscula(pedra),
      linhas: [...porVendedora.values()]
        .filter((l) => l.quantidade > 0)
        .sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor)
        .slice(0, limitar(limite)),
      pedras: [],
      periodo: rotuloDoPeriodo(janela),
    };
  }


  /** A janela de um periodo dito em datas, para quem pede "de 01/08 a 31/08". */
  async resumoEntre(
    de: Date,
    ate: Date,
    vendedoraId?: string | null,
  ): Promise<ResumoDeVendas> {
    return this.vendas.resumo(fimDoDia({ de, ate }), vendedoraId);
  }

  async itensEntre(
    de: Date,
    ate: Date,
    limite = LIMITE_PADRAO,
    vendedoraId?: string | null,
  ): Promise<ItemMaisVendido[]> {
    return this.vendas.itensMaisVendidos(
      fimDoDia({ de, ate }),
      limitar(limite),
      vendedoraId,
    );
  }

  async rankingEntre(
    de: Date,
    ate: Date,
    limite = LIMITE_PADRAO,
  ): Promise<VendedoraNoRanking[]> {
    return this.vendas.rankingDeVendedoras(fimDoDia({ de, ate }), limitar(limite));
  }

  /**
   * Quem mais vendeu um TIPO de peca — 28/09/2026.
   *
   * As duas formas, como as demais consultas: pelo atalho ou por datas soltas.
   * A pergunta que motivou isto — "quem mais vende brinco em outubro" — precisa
   * das duas: o outubro de um ano especifico so sai por data.
   */
  async porFamilia(
    familia: string,
    recorte: RecorteDeVendas = 'MES',
    limite = LIMITE_PADRAO,
    agora: Date = new Date(),
  ) {
    const janela = janelaDe(recorte, agora);
    const linhas = await this.vendas.rankingPorFamilia(
      janela,
      familia,
      prefixosDoTipo(familia),
      limitar(limite),
    );
    return { linhas, ...janela };
  }

  async porFamiliaEntre(
    familia: string,
    de: Date,
    ate: Date,
    limite = LIMITE_PADRAO,
  ) {
    return this.vendas.rankingPorFamilia(
      fimDoDia({ de, ate }),
      familia,
      prefixosDoTipo(familia),
      limitar(limite),
    );
  }

  /**
   * O mesmo mes, em todos os anos — "quem mais vende brinco em outubro".
   *
   * `porAno` NAO passa pelo `limitar`: aquele teto (30) e para uma lista que
   * alguem le no WhatsApp, e aqui o numero multiplica pelos anos que houver.
   * Tres por ano em quatro anos ja sao doze linhas. O padrao e 1 — a campea
   * de cada outubro, que e a pergunta.
   */
  async porFamiliaNoMes(familia: string, mes: number, porAno = 1) {
    return this.vendas.rankingPorFamiliaNoMes(
      mes,
      familia,
      prefixosDoTipo(familia),
      Math.min(Math.max(Math.trunc(porAno) || 1, 1), 5),
    );
  }
}

/**
 * Teto e piso do limite.
 *
 * O TETO PADRAO SUBIU EM 28/10/2026, e a razao do antigo caiu.
 *
 * ==========================================================================
 * Dizia: *"quem pede 'me lista as 500 pecas' no WhatsApp recebe uma mensagem
 * que ninguem le e paga o token de todas elas"*. Isso era verdade enquanto a
 * lista na conversa fosse o que a pessoa lia — e deixou de ser: desde 28/10 a
 * lista inteira sai escrita pelo NOSSO codigo, e o modelo recebe uma dezena
 * de linhas e uma frase para escrever.
 *
 * Entao o teto de 30 virou o que ele sempre foi na pratica: um corte
 * silencioso. Era ele que fazia o PDF das "43 vendas" sair com trinta em
 * 27/10, e o das 582 pecas sair com dez em 28/10 — duas vezes o mesmo
 * defeito, em dois metodos diferentes.
 *
 * O teto agora e o da casa. Quem quiser cortar para a CONVERSA corta onde
 * se escreve a conversa, e declarando.
 * ==========================================================================
 */
function limitar(limite: number, teto = LIMITE_DO_ARQUIVO): number {
  if (!Number.isFinite(limite) || limite < 1) return LIMITE_PADRAO;
  return Math.min(Math.trunc(limite), teto);
}

/**
 * O MESMO DIA E MÊS, UM ANO ANTES — 16/11/2026.
 *
 * ==========================================================================
 * É A TRAVA CONTRA UM ERRO QUE EU JÁ COMETI.
 *
 * No plano da quebra por metal eu comparei 2025 INTEIRO com 2026 até
 * novembro, e o ano velho ganhou por ter dois meses a mais. O
 * `comparar_com_outros_anos` já avisava disso desde 29/09 — *"a comparação é
 * cortada no mesmo dia em todos os anos, porque comparar mês parcial com mês
 * inteiro faz o ano atual sempre parecer pior"*.
 *
 * Montando a janela aqui, ninguém mais precisa lembrar: nem o modelo, nem eu.
 * ==========================================================================
 *
 * O 29 DE FEVEREIRO NÃO EXISTE NO ANO ANTERIOR, e sem o corte viraria 1º de
 * março — um dia a mais, do mês errado.
 */
/**
 * "2026", ou "2025/2026" quando a janela atravessa a virada do ano.
 *
 * NÃO SE INVENTA UM ANO SÓ para uma janela que pega dezembro e janeiro:
 * dizer "2026" ali seria mentira curta e difícil de perceber.
 */
/**
 * O PERÍODO POR EXTENSO — 16/11/2026.
 *
 * ==========================================================================
 * NASCEU DE UM NÚMERO FALSO NA FRENTE DO LUCAS.
 *
 * Ele perguntou "quem vendeu mais pérola?" no teste local. O modelo chamou
 * com `periodo: MES` por conta própria, o mês corrente não tem venda nenhuma
 * — a movimentação está parada desde 05/11 — e a resposta vazia dizia apenas
 * "ninguém vendeu nesse período".
 *
 * O modelo preencheu o buraco: "nenhuma venda de pérola aparece em 2026
 * ainda". E em 2026 havia três vendedoras com pérola.
 *
 * QUEM NÃO DIZ O RECORTE CONVIDA A INVENÇÃO. Agora toda resposta carrega o
 * período que consultou, e a vazia carrega com mais razão ainda.
 * ==========================================================================
 *
 * A DATA É ESCRITA À MÃO, e não com `toLocaleDateString`: o container é
 * Alpine e o ICU do Node já mordeu este projeto antes. Mesma razão dos doze
 * meses por extenso do `ferramentas-gestao.service`.
 */
function rotuloDoPeriodo(janela?: JanelaDeVendas): string {
  if (!janela) return 'o histórico inteiro';
  return `de ${diaBarraMes(janela.de)} a ${diaBarraMes(janela.ate)}`;
}

function diaBarraMes(data: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()}`;
}
function rotuloDoAno(janela: JanelaDeVendas): string {
  const inicio = janela.de.getFullYear();
  const fim = janela.ate.getFullYear();
  return inicio === fim ? String(inicio) : `${inicio}/${fim}`;
}

function umAnoAntes(janela: JanelaDeVendas): JanelaDeVendas {
  return { de: umAnoAntesDe(janela.de), ate: umAnoAntesDe(janela.ate) };
}

function umAnoAntesDe(data: Date): Date {
  const ano = data.getFullYear() - 1;
  const mes = data.getMonth();
  const ultimoDiaDoMes = new Date(ano, mes + 1, 0).getDate();
  return new Date(
    ano,
    mes,
    Math.min(data.getDate(), ultimoDiaDoMes),
    data.getHours(),
    data.getMinutes(),
    data.getSeconds(),
    data.getMilliseconds(),
  );
}

/**
 * DO QUE MAIS SAIU PARA O QUE MENOS SAIU, e "sem tipo" por último.
 *
 * Pelo MAIOR dos dois anos, e não pelo atual: um tipo que vendeu 72 no ano
 * passado e zero neste é exatamente a linha que a gestora quer ver, e
 * ordenar pelo ano corrente a jogaria para o fim da lista.
 */
function ordemDosTipos(a: VendasDeUmTipo, b: VendasDeUmTipo): number {
  const semTipo = comInicialMaiuscula(SEM_TIPO);
  if (a.tipo === semTipo) return 1;
  if (b.tipo === semTipo) return -1;
  return (
    Math.max(b.quantidade, b.quantidadeAnterior) -
      Math.max(a.quantidade, a.quantidadeAnterior) || b.valor - a.valor
  );
}

function comInicialMaiuscula(palavra: string): string {
  return palavra.charAt(0).toUpperCase() + palavra.slice(1);
}

/**
 * A janela de cada recorte.
 *
 * O FIM E SEMPRE `agora`, e nao o fim do dia: perguntar "quanto vendemos hoje"
 * as 10h e receber o resultado incluindo a tarde seria mentira — e nas janelas
 * maiores o efeito e o mesmo, so que invisivel.
 *
 * MES e ANO sao do CALENDARIO (dia 1, janeiro 1), e nao "ultimos 30 dias":
 * quem pergunta "como esta o mes" quer o mes fechado contra a meta, e nao uma
 * janela movel que nunca bate com nada que a gestao acompanha.
 */
function janelaDe(recorte: RecorteDeVendas, agora: Date): JanelaDeVendas {
  const inicioDoDia = new Date(agora);
  inicioDoDia.setHours(0, 0, 0, 0);

  switch (recorte) {
    case 'HOJE':
      return { de: inicioDoDia, ate: agora };

    case 'ONTEM': {
      const de = new Date(inicioDoDia);
      de.setDate(de.getDate() - 1);
      const ate = new Date(inicioDoDia);
      ate.setMilliseconds(-1);
      return { de, ate };
    }

    case 'SEMANA': {
      const de = new Date(inicioDoDia);
      de.setDate(de.getDate() - 6);
      return { de, ate: agora };
    }

    case 'MES': {
      const de = new Date(inicioDoDia);
      de.setDate(1);
      return { de, ate: agora };
    }

    case 'ANO': {
      const de = new Date(inicioDoDia);
      de.setMonth(0, 1);
      return { de, ate: agora };
    }
  }
}

/** Datas soltas chegam como meia-noite; o fim tem que abraçar o dia inteiro. */
function fimDoDia(janela: JanelaDeVendas): JanelaDeVendas {
  const ate = new Date(janela.ate);
  if (
    ate.getHours() === 0 &&
    ate.getMinutes() === 0 &&
    ate.getSeconds() === 0 &&
    ate.getMilliseconds() === 0
  ) {
    ate.setHours(23, 59, 59, 999);
  }
  return { de: janela.de, ate };
}

/**
 * O METAL DESTA LINHA, por extenso e com a inicial maiuscula.
 *
 * O dicionario devolve em caixa baixa porque e chave de busca; aqui a
 * linha vai para a conversa.
 */
function nomeDoMetal(linha: VendasPorCor): string {
  const palavra = metalDaCor(linha.cor) ?? metalDaEtiqueta(linha.etiqueta);
  if (!palavra) return SEM_METAL;
  return palavra.charAt(0).toUpperCase() + palavra.slice(1);
}

/**
 * MAIOR VALOR PRIMEIRO, e `SEM_METAL` SEMPRE POR ULTIMO.
 *
 * Ela nao concorre com os metais: e ressalva. Deixa-la competir por valor
 * poria "sem classificacao" no topo num periodo de pouca joia, e a leitura
 * da gestora viraria "o que mais vendeu foi coisa sem metal".
 */
function ordemDosMetais(a: VendasDeUmMetal, b: VendasDeUmMetal): number {
  if (a.metal === SEM_METAL) return 1;
  if (b.metal === SEM_METAL) return -1;
  return b.valor - a.valor;
}
