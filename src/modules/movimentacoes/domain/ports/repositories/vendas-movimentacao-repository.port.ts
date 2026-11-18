/**
 * A VENDA LIDA DE ONDE ELA REALMENTE ESTA — 25/09/2026.
 *
 * ==========================================================================
 * A TABELA `vendas` NAO E MAIS A FONTE. DECISAO DO LUCAS.
 *
 * Em 25/09 a copia de producao mostrou 1.388 documentos de movimentacao —
 * 1.287 VENDA e 101 DEVOLUCAO, de junho/2023 a setembro/2026, R$ 66,2 milhoes
 * — com cliente, vendedora, operacao e empresa resolvidos em TODOS, e 2.163
 * itens apontando para produtos do catalogo.
 *
 * A tabela `vendas` tem ZERO linhas. Todo o painel le `vendas`: as telas de
 * Vendas e Analytics, Top produtos, Top vendedoras, metas, os giros, e as
 * ferramentas das agentes. Por isso a loja parece nao ter vendido nada tendo
 * tres anos de historico no banco.
 *
 * O caminho escolhido NAO e projetar movimentacao em `vendas`: e a leitura
 * migrar para ca. Esta porta e o primeiro pedaco dessa migracao, e nasce
 * atendendo as agentes — o que o Lucas pediu primeiro — com a forma que as
 * TELAS vao reusar depois.
 * ==========================================================================
 *
 * A DEVOLUCAO ABATE, e nao e detalhe: sao 101 documentos e R$ 4,0 milhoes.
 * Somando so as saidas, todo numero que a agente responde sai ~6% acima do
 * real — e ninguem desconfia de um numero que parece plausivel.
 */

/** O recorte de tempo. Sempre fechado dos dois lados. */
export interface JanelaDeVendas {
  de: Date;
  /** INCLUSIVO — quem monta a janela ja poe o fim do dia. */
  ate: Date;
}

/**
 * O corte por valor DA PECA — 13/10/2026.
 *
 * Os dois sao opcionais e cada combinacao e uma pergunta: so `minimo` e
 * "acima de X", so `maximo` e "ate X", os dois e "entre X e Y". Nenhum dos
 * dois nao e pergunta nenhuma, e quem chama recusa antes de consultar.
 */
export interface FaixaDeValor {
  minimo?: number;
  maximo?: number;
}

/** Uma peca vendida na faixa, com de quem foi e por quem. */
export interface PecaNaFaixa {
  codigoErp: string | null;
  descricao: string | null;
  /** O valor DA PECA, que e o que a faixa filtra. */
  valorUnitario: number;
  quantidade: number;
  quando: Date;
  clienteNome: string | null;
  vendedoraNome: string | null;
}

/** Quanto a vendedora fez na faixa — para "quem vendeu mais acima de X". */
export interface VendedoraNaFaixa {
  nome: string;
  pecas: number;
  valor: number;
}

export interface PecasNaFaixa {
  /** Soma de `quantidade`, e nao contagem de linhas. */
  pecas: number;
  valor: number;
  /**
   * Quantas pecas da MESMA faixa voltaram por devolucao no periodo.
   *
   * NAO foi descontado de `pecas` — a contagem de venda nao abate, pela
   * convencao do `receitaLiquida`. Esta aqui para a resposta poder dizer.
   */
  devolvidas: number;
  /** Uma linha por vendedora, da que mais vendeu para a que menos. */
  porVendedora: VendedoraNaFaixa[];
  /** As maiores da faixa, cortadas pelo teto. */
  linhas: PecaNaFaixa[];
  /** Quantas linhas existem antes do teto — o teto precisa se anunciar. */
  totalDeLinhas: number;
}

/** Uma das duas pontas da consignacao. Ver `consignacoes`. */
export interface PontaDeConsignacao {
  /** Documentos no periodo. */
  quantidade: number;
  /** Soma do valor dos documentos, a preco de venda. */
  valor: number;
  /** Pecas somadas dos itens. */
  pecas: number;
}

export interface ConsignacoesDoPeriodo {
  /** O que SAIU: operacao CONSIGNACAO, do estoque para a conta de alguem. */
  saidas: PontaDeConsignacao;
  /** O que VOLTOU: operacao RETORNO DE CONSIGNACAO, de volta ao estoque. */
  retornos: PontaDeConsignacao;
  /**
   * O QUE AINDA ESTA FORA, HOJE — 18/11/2026.
   *
   * NAO E A DIFERENCA ENTRE AS DUAS PONTAS acima: documento nao casa com
   * documento, e 80 retornos menos 69 consignacoes nao quer dizer nada. A
   * conta e por PECA — saiu menos voltou menos vendida —, e o que sobra
   * positivo esta na mao de alguem.
   *
   * E UMA POSICAO, NAO UM PERIODO: nao depende da janela, e quem mostrar
   * tem de dizer "hoje". Medido em 18/11: 146 pecas, R$ 10.406.273,00.
   */
  emAberto: {
    pecas: number;
    valor: number;
    /**
     * Destas, quantas sairam DENTRO da janela perguntada.
     *
     * E a PONTE entre o fluxo e a posicao, e sem ela os tres numeros nao
     * fecham para quem le: em 18/11 sairam 294 pecas em novembro,
     * voltaram 309, e 146 seguem fora. Das 146, 110 sairam em novembro e
     * 36 em meses anteriores — dito isso, a conta fecha.
     */
    doPeriodo: number;
  };
}

/**
 * AS DEVOLUCOES DE VENDA DO PERIODO — 18/11/2026.
 *
 * ======================================================================
 * ELE PERGUNTOU UM NUMERO E LEVOU UMA TABELA.
 *
 * As 13:39 de 18/11, em producao: *"quantas pecas devolvidas em novembro
 * de 2026"* respondeu certo e em seguida imprimiu a listagem inteira,
 * cliente por cliente. A agente nao escolheu mandar a tabela — devolucao
 * so existia dentro do `listarDetalhadas`, que imprime como efeito de ser
 * chamado. Nao havia porta para o numero sozinho.
 *
 * E NAO CONFUNDIR COM RETORNO DE CONSIGNACAO. Sao operacoes diferentes:
 * devolucao de venda e ENTRADA SEM SAIDA, de peca que foi vendida e
 * voltou; retorno de consignacao tem AS DUAS BANDEIRAS, de peca que nunca
 * foi vendida. Em novembro foram 3 devolucoes contra 80 retornos.
 * ======================================================================
 */
export interface DevolucoesDoPeriodo {
  /** Documentos de devolucao de venda no periodo. */
  documentos: number;
  /**
   * Pecas somadas dos itens — E NAO E O MESMO NUMERO.
   *
   * Em novembro de 2026 foram 3 e 3, e por isso a frase inventada
   * ("3 pecas" para 3 documentos) passou despercebida. Em agosto foram
   * 7 documentos e 8 pecas.
   */
  pecas: number;
  /** Soma do valor dos documentos devolvidos, positiva. */
  valor: number;
}

export interface ResumoDeVendas {
  /** Documentos de VENDA no periodo. */
  quantidade: number;
  /** Saidas MENOS devolucoes. */
  receita: number;
  /** Receita liquida dividida pela quantidade de vendas. 0 quando nao ha. */
  ticketMedio: number;
  devolucoes: number;
  valorDevolvido: number;
  /**
   * CLIENTES DISTINTOS que compraram — 29/09/2026.
   *
   * ========================================================================
   * "QUANTOS CLIENTES TIVE" E "QUANTAS VENDAS FIZ" SAO PERGUNTAS DIFERENTES.
   *
   * A mesma cliente comprando tres vezes vale 3 em `quantidade` e 1 aqui. Ate
   * hoje so existia o primeiro numero, e a Anastasia respondia "essa consulta
   * e de vendas, nao de clientes distintos — nao tenho como contar quantos
   * clientes diferentes compraram". Ela tinha como: ninguem perguntou ao
   * banco.
   *
   * Conferido em 29/09: nos ultimos sete dias, 12 clientes em 13 vendas.
   * ========================================================================
   */
  clientes: number;
}

export interface VendedoraNoRanking {
  vendedoraId: string;
  nome: string;
  codigoErp: string | null;
  /** Documentos de venda. A devolucao nao entra na contagem. */
  quantidade: number;
  valor: number;
  /**
   * PECAS vendidas — 02/10/2026.
   *
   * "Quem vendeu mais pecas em setembro?" nao tinha resposta: o ranking
   * contava DOCUMENTOS e dinheiro, e a contagem de pecas so existia por
   * familia, uma de cada vez. Quem vende uma alianca de R$ 200 mil lidera o
   * faturamento e pode ser a ultima em pecas — sao perguntas diferentes.
   *
   * A DEVOLUCAO NAO ABATE AQUI — mudou em 02/10/2026. Abatendo, a Ylka saia
   * como "2 vendas, 0 pecas" em agosto: ela vendeu duas pecas, e as duas
   * pulseiras que voltaram no mes tinham sido vendidas em OUTRO. O liquido
   * somava dois meses num numero so, e o resultado nao se explicava para quem
   * lia — a gestao olha e diz que nao faz sentido, com razao.
   *
   * O DINHEIRO CONTINUA LIQUIDO, porque e a receita e e ela que fecha com a
   * tela de Vendas: agosto/2026 da R$ 934.126,50 somando exatamente estas
   * linhas. As reguas ficam diferentes de proposito, e por isso a devolucao
   * viaja ao lado, nos tres campos abaixo: muda a regua, nada fica escondido.
   */
  pecas: number;
  /**
   * As pecas QUEBRADAS POR TIPO, da maior para a menor — 02/10/2026.
   *
   * "12 pecas" responde quem vendeu mais; "12 pecas (6 colares, 4 aneis, 2
   * solitarios)" responde o que ela vende. Era a leitura que a gestora
   * estava montando a mao, somando familia por familia.
   */
  familias: { familia: string; quantidade: number }[];
  /**
   * PECAS QUE VOLTARAM no recorte — 02/10/2026.
   *
   * Zero na grande maioria: 32 de 268 linhas (vendedora x mes) da base tem
   * alguma devolucao, e nas outras 236 a linha sai igual ao que era.
   */
  devolvidas: number;
  /**
   * Quanto voltou em dinheiro — JA DESCONTADO do `valor`.
   *
   * E o campo que explica a linha. A Ylka aparece com R$ 33.590 em agosto
   * tendo vendido R$ 144.050: sem este numero, 77% do mes dela e invisivel e
   * a leitura vira "vendeu pouco" em vez de "teve devolucao".
   */
  valorDevolvido: number;
  /** As devolvidas por tipo, da maior para a menor. */
  familiasDevolvidas: { familia: string; quantidade: number }[];
}

/**
 * UMA LINHA CRUA DA QUEBRA POR METAL — 16/11/2026.
 *
 * A `cor` e a etiqueta saem como estao no cadastro: quem NOMEIA o metal e o
 * dicionario (`metalDaCor` e `metalDaEtiqueta`), no caso de uso. Aqui nao ha
 * regra de negocio nenhuma — e de proposito, porque esta casa nao tem teste de
 * repositorio, e regra dentro do SQL seria regra sem teste.
 */
export interface VendasPorCor {
  cor: string | null;
  etiqueta: string | null;
  /** Soma das quantidades — pode ser fracionaria (o ERP usa NUMERIC). */
  quantidade: number;
  valor: number;
}

/**
 * UMA LINHA CRUA DA QUEBRA POR TIPO DE PEÇA — 16/11/2026.
 *
 * Os três campos saem como estão no cadastro: quem NOMEIA o tipo é o
 * dicionário (`tipoDaPeca`), no caso de uso. Aqui não há regra de negócio
 * nenhuma — pelo mesmo motivo do `VendasPorCor`: esta casa não tem teste de
 * repositório, e regra dentro do SQL seria regra sem teste.
 *
 * OS DOIS RECORTES VÊM NA MESMA LINHA, e não em duas consultas: é o `FILTER`
 * do Postgres, como o `compararPeriodoNosAnos` já faz desde 29/09. Com isso o
 * corte no mesmo dia dos dois anos fica garantido por construção, e não por
 * aviso na descrição da ferramenta.
 */
export interface VendasPorTipoCru {
  categoria: string | null;
  /** O PREFIXO, duas letras — é tudo o que o `tipoDaPeca` lê do código. */
  codigoErp: string | null;
  familia: string | null;
  quantidade: number;
  valor: number;
  /** Zero quando não se pediu comparação. */
  quantidadeAnterior: number;
  valorAnterior: number;
}

/**
 * UMA LINHA CRUA DA QUEBRA POR PEDRA — 16/11/2026.
 *
 * AS DUAS FONTES VIAJAM, e as duas são parciais: medido nas 582 peças
 * vendidas em 2026, juntas reconhecem pedra em 337; o campo `tipo_pedra`
 * sozinho perderia 43 e a etiqueta sozinha perderia 49.
 */
export interface VendasPorPedraCru {
  /** Preenchidos só quando se pediu a quebra por vendedora. */
  vendedoraId: string | null;
  vendedora: string | null;
  tipoPedra: string | null;
  etiqueta: string | null;
  quantidade: number;
  valor: number;
  /** Zero quando não se pediu comparação. Ver `VendasPorTipoCru`. */
  quantidadeAnterior: number;
  valorAnterior: number;
}

export interface ItemMaisVendido {
  produtoId: string;
  codigoErp: string | null;
  descricao: string | null;
  familia: string | null;
  /** Soma das quantidades — pode ser fracionaria (o ERP usa NUMERIC). */
  quantidade: number;
  valor: number;
}

/** Uma vendedora no ranking de um tipo de peca. Ver `rankingPorFamilia`. */
export interface VendedoraPorFamilia {
  vendedoraId: string;
  nome: string;
  /**
   * Pecas daquela familia VENDIDAS no recorte — a devolucao nao abate.
   *
   * Abatia ate 02/10/2026, e a lista saia com "KEYCIANE BARBOSA: -1
   * pingentes": a agente apagou essa linha ao responder, porque ela nao tem
   * leitura numa pergunta sobre o que foi vendido. "Se e vendas, nao entra
   * devolucao" — a regra do Lucas no mesmo dia.
   */
  quantidade: number;
  valor: number;
}

/** A mesma linha, carimbada com o ano. Ver `rankingPorFamiliaNoMes`. */
export interface VendedoraPorFamiliaNoAno extends VendedoraPorFamilia {
  ano: number;
}

/** Uma linha da comparação ano a ano. */
export interface ComparacaoAnual {
  ano: number;
  /** Receita do recorte até o dia do corte (ou do recorte inteiro, sem corte). */
  receita: number;
  quantidade: number;
  /** O recorte FECHADO. Igual a `receita` quando não houve corte. */
  receitaFechada: number | null;
}

/**
 * UMA VENDA, COM NOME E COM AS PECAS — 02/10/2026.
 *
 * Tudo o que esta aqui ja existia espalhado em consultas agregadas. O que nao
 * existia era a LINHA: quanto a vendedora vendeu, a agente sabia dizer; QUAIS
 * vendas foram, nao.
 */
export interface ItemDaVenda {
  quantidade: number;
  nome: string;
  /** Quantidade x valor unitario. */
  valor: number;
}

export interface VendaDetalhada {
  documento: string | null;
  data: Date;
  clienteCodigo: string | null;
  cliente: string | null;
  vendedora: string | null;
  valor: number;
  /** `concluida` ou `devolvida`. Cancelada nao entra na listagem. */
  status: string;
  /**
   * As pecas da venda, como DADO e nao como texto.
   *
   * Formatar no SQL parecia mais curto e saiu errado duas vezes: a quantidade
   * e `numeric(x,4)` e virava "1.0000x", e o `to_char` de dinheiro usa a
   * localidade do BANCO — "R$ 69,934.67", com a virgula e o ponto trocados.
   * Dinheiro e numero se formatam onde ja existe o formatador da casa.
   */
  itens: ItemDaVenda[];
}

/**
 * O RECORTE. Pelo menos um alem da janela — ver `EXIGE_RECORTE` no handler.
 */
export interface FiltroVendasDetalhadas {
  janela?: JanelaDeVendas;
  clienteId?: string | null;
  vendedoraId?: string | null;
  /** A empresa do grupo que emitiu a venda — `movimentacoes.empresa_id`. */
  empresaId?: string | null;
  /** O numero do documento, como a pessoa fala dele. */
  documento?: string | null;
  /**
   * QUAIS DOCUMENTOS ENTRAM. O padrao e `CONCLUIDAS` — so venda.
   *
   * ======================================================================
   * ESTA ERA A UNICA CONSULTA DA CASA QUE CONTAVA DEVOLUCAO COMO VENDA, e
   * o estrago apareceu numa conversa so, em 27/10/2026:
   *
   *   "Em 2026 (ate hoje) — 38 vendas, R$ 2.230.827"   (o resumo)
   *   "Sao 43 vendas em 2026; estas sao as 10 mais recentes"  (a lista)
   *
   * A mesma pergunta com duas respostas, e nenhuma das duas dizendo qual.
   * 43 eram as MOVIMENTACOES ativas: 38 saidas e 5 entradas — e a prova
   * estava na propria lista, no item marcado DEVOLVIDA.
   *
   * Decisao do Lucas: *"se ela pediu as vendas.. so o que foi concluido..
   * devolucao so se ela perguntar"*. Entao o padrao exclui, e quem quer a
   * devolucao pede por ela.
   * ======================================================================
   */
  status?: StatusDeVendaConsultada;
}

/**
 * O recorte por status, como a pergunta chega.
 *
 * `CONCLUIDAS` e o padrao e nao precisa ser dito. `DEVOLVIDAS` e a pergunta
 * propria ("quais devolucoes da Ylka"). `TODAS` e para quem pede os dois
 * juntos — e ai a lista diz, linha por linha, qual e qual.
 */
export type StatusDeVendaConsultada = 'CONCLUIDAS' | 'DEVOLVIDAS' | 'TODAS';

/**
 * O FATURAMENTO DE UMA EMPRESA DO GRUPO — 02/10/2026.
 *
 * A A.T tem oito CNPJs cadastrados, e a venda sai por um deles. Ate hoje nada
 * no sistema olhava essa coluna: todo numero que a gestao ve e a SOMA de
 * todas as empresas.
 */
export interface VendasDeUmaEmpresa {
  empresa: string;
  /** Documentos de VENDA. A devolucao nao entra na contagem. */
  vendas: number;
  /** Saidas MENOS devolucoes. */
  receita: number;
  devolucoes: number;
}

export interface IVendasMovimentacaoRepository {
  /**
   * A quebra por empresa do grupo, do maior faturamento para o menor.
   *
   * SEM JANELA E O HISTORICO INTEIRO — "qual o faturamento da MP?" costuma
   * ser sobre a vida da empresa, e nao sobre este mes.
   *
   * SO QUEM TEVE MOVIMENTO APARECE. Listar as oito com zero faria a resposta
   * parecer um cadastro, e a pergunta e sobre faturamento.
   */
  receitaPorEmpresa(janela?: JanelaDeVendas): Promise<VendasDeUmaEmpresa[]>;

  /**
   * As vendas do recorte, uma a uma, com cliente, vendedora e PECAS.
   *
   * Devolve a amostra E o total: dez de trinta e nove sem o numero soa
   * completo, e quem le vai embora com a impressao errada.
   */
  listarDetalhadas(
    filtro: FiltroVendasDetalhadas,
    limite: number,
  ): Promise<{ vendas: VendaDetalhada[]; total: number }>;

  /**
   * O resumo do periodo. Com `vendedoraId`, so o dela — e e assim que a
   * vendedora ve as PROPRIAS vendas, sem enxergar a equipe.
   */
  resumo(
    janela: JanelaDeVendas,
    vendedoraId?: string | null,
    /** O recorte de equipe. Ver `vendedoras` no `vendasPorMetal`. */
    vendedoras?: string[] | null,
  ): Promise<ResumoDeVendas>;

  /**
   * A MERCADORIA QUE CIRCULOU — 18/11/2026.
   *
   * ======================================================================
   * O MAIOR MOVIMENTO DA CASA, E ATE 18/11 NAO HAVIA COMO PERGUNTAR POR ELE.
   *
   * Consignacao e joia saindo para ficar com alguem; retorno e ela voltando.
   * Nenhum dos dois e venda — ver `ehConsignacao`. Em 01 a 17/11 foram 149
   * documentos e R$ 52,6 milhoes, trinta vezes o que a loja vendeu no mesmo
   * periodo.
   *
   * Ate o conserto da consignacao isso entrava no total de vendas, e por
   * isso ninguem precisava perguntar: ja estava la, errado. Tirar abriu a
   * pergunta legitima, e e esta ferramenta.
   *
   * AS DUAS PONTAS NAO SE SUBTRAEM. No historico ha 3.560 retornos contra
   * 2.822 consignacoes: uma maleta sai num documento e volta em pedacos, em
   * documentos diferentes. Nao existe "em aberto" calculavel daqui, e quem
   * tentar obtem numero negativo que nao significa nada.
   * ======================================================================
   */
  consignacoes(
    janela: JanelaDeVendas,
    /** O recorte de equipe. Ver `vendedoras` no `vendasPorMetal`. */
    vendedoras?: string[] | null,
  ): Promise<ConsignacoesDoPeriodo>;

  /**
   * AS DEVOLUCOES DE VENDA, EM NUMERO — 18/11/2026. Ver
   * `DevolucoesDoPeriodo`.
   *
   * Existe para que "quantas devolucoes tivemos" tenha resposta sem
   * passar pelo `listarDetalhadas`, que imprime a tabela sempre. Quem
   * pede A LISTA continua indo la.
   */
  devolucoes(
    janela: JanelaDeVendas,
    /** O recorte de equipe. Ver `vendedoras` no `vendasPorMetal`. */
    vendedoras?: string[] | null,
  ): Promise<DevolucoesDoPeriodo>;

  /** Quem vendeu mais no periodo. So quem teve venda aparece. */
  rankingDeVendedoras(
    janela: JanelaDeVendas,
    limite: number,
  ): Promise<VendedoraNoRanking[]>;

  /**
   * As pecas que mais sairam. Com `vendedoraId`, so as dela; com `familia`,
   * so as daquele tipo.
   *
   * ORDENADO POR VALOR, e nao por quantidade: numa joalheria a peca que sai
   * dez vezes costuma ser a mais barata da vitrine, e "o que mais vendeu" no
   * sentido que interessa a gestao e o que mais FATUROU.
   */
  itensMaisVendidos(
    janela: JanelaDeVendas,
    limite: number,
    vendedoraId?: string | null,
    familia?: string | null,
  ): Promise<ItemMaisVendido[]>;

  /**
   * AS PECAS VENDIDAS NUMA FAIXA DE VALOR — 13/10/2026.
   *
   * ========================================================================
   * "QUANTAS PECAS ACIMA DE 100 MIL FORAM VENDIDAS EM 2025?"
   *
   * A Anastasia respondeu, corretamente, que nao conseguia: havia total,
   * ranking e as vendas por cliente ou vendedora, e nenhum corte por FAIXA
   * DE VALOR no historico. O filtro de preco so existia no catalogo, que e
   * o estoque de hoje — outra pergunta.
   * ========================================================================
   *
   * A FAIXA E DO `valor_unitario`, e nao do documento. "Peca acima de 100
   * mil" e a PECA: um documento de 120 mil com duas pecas de 60 nao tem
   * nenhuma peca acima de 100 mil, e conta-lo seria responder outra coisa.
   *
   * CONTA PECA, e nao linha: `sum(quantidade)`. Medido em 13/10, na faixa
   * acima de 100 mil as duas contas dao igual (146 e 146) porque peca cara
   * sai uma a uma — mas ha linhas com quantidade ate 8 na base, e numa faixa
   * mais baixa a diferenca apareceria.
   *
   * A DEVOLUCAO NAO ABATE A CONTAGEM, pela mesma razao do `itensMaisVendidos`
   * acima e do `receitaLiquida`: ela volta o documento inteiro, e descontar
   * peca a peca misturaria duas perguntas. O resultado traz `devolvidas` ao
   * lado, para quem le saber que existem — sao 8 das 146 na base de hoje.
   */
  pecasPorFaixaDeValor(
    janela: JanelaDeVendas,
    faixa: FaixaDeValor,
    limite: number,
    deslocamento: number,
    vendedoraId?: string | null,
  ): Promise<PecasNaFaixa>;

  /**
   * QUEM MAIS VENDEU UM TIPO DE PECA — 28/09/2026.
   *
   * ========================================================================
   * E O RANKING QUE FALTAVA, E ELE NAO SAI DOS OUTROS DOIS.
   *
   * Pergunta do Lucas: "qual a vendedora que mais vende brinco?". O
   * `rankingDeVendedoras` soma TUDO que cada uma vendeu, sem separar tipo; o
   * `itensMaisVendidos` separa por peca mas agrupa por PRODUTO, e nao por
   * quem vendeu. Cruzar os dois exigiria uma consulta por vendedora, e a
   * agente respondia "nao da para cruzar" — que era verdade.
   *
   * ORDENADO POR QUANTIDADE, e aqui isto DIVERGE do resto de proposito. Nos
   * outros rankings a ordem e por valor, porque "o que mais vendeu" para a
   * gestao quer dizer o que mais faturou. Aqui a pergunta e "quem mais VENDE
   * brinco", e a resposta esperada e "a Aline, 23 brincos". O valor vai junto
   * na linha, para quem quiser os dois.
   * ========================================================================
   */
  /**
   * `prefixos` É O CONSERTO DE 16/11/2026, e ele manda quando vem.
   *
   * Com prefixos, a peça de joia casa pelo CÓDIGO — é o que traz de volta
   * o colar riviera e o brinco solitário, que a `familia` escondia. O que
   * está fora da joia segue casando pela `familia`, porque ali ela é limpa.
   *
   * `null` quando a palavra NÃO é tipo de joia — "riviera", "vaso",
   * "corset" —, e aí vale a regra antiga, inteira.
   */
  rankingPorFamilia(
    janela: JanelaDeVendas,
    familia: string,
    prefixos: string[] | null,
    limite: number,
  ): Promise<VendedoraPorFamilia[]>;

  /**
   * O MESMO MES, EM TODOS OS ANOS — 28/09/2026.
   *
   * ========================================================================
   * NAO SAI DE UMA JANELA `de`/`ate`, E E POR ISSO QUE EXISTE.
   *
   * "Qual vendedora mais vende brinco em outubro?" nao pergunta por um
   * outubro: pergunta pelos outubros. Todo o resto deste arquivo trabalha com
   * uma janela CONTINUA — um inicio e um fim —, e outubro de 2023 mais
   * outubro de 2025 nao e um intervalo, e sim um `extract(month) = 10`
   * atravessando os anos.
   *
   * Responder isso com a janela livre exigiria uma chamada por ano, e antes
   * saber quais anos tem dado — que e outra consulta ainda.
   *
   * QUEBRADO POR ANO, e nao somado: a resposta que o Lucas descreveu e "em
   * outubro de 2025 foi essa, em 2024 foi essa". Um total dos tres outubros
   * esconderia justamente a virada, que e o que a pergunta procura.
   * ========================================================================
   *
   * @param mes 1 a 12.
   * @param porAno quantas vendedoras por ano. 1 devolve so a campea de cada.
   */
  /**
   * O MESMO RECORTE, ANO A ANO — 29/09/2026.
   *
   * ========================================================================
   * DOIS TOTAIS POR ANO, E NAO UM.
   *
   * `receita` e o recorte ATE O DIA do corte; `receitaFechada` e o recorte
   * inteiro. Quando o mes ainda corre, os dois diferem nos anos passados e sao
   * iguais no ano corrente — e e essa diferenca que permite a resposta dizer
   * "ate o dia 29 estamos 12% abaixo" E "setembro passado fechou em R$ 2,1 mi"
   * sem duas consultas.
   *
   * `dia` nulo significa "sem corte": os dois totais voltam iguais.
   * ========================================================================
   */
  compararMesNosAnos(
    mes: number,
    dia: number | null,
    vendedoraId: string | null,
  ): Promise<ComparacaoAnual[]>;

  /** O mesmo (mes, dia) inicial e final, em cada ano. */
  compararPeriodoNosAnos(
    inicio: { mes: number; dia: number },
    fim: { mes: number; dia: number },
    vendedoraId: string | null,
  ): Promise<ComparacaoAnual[]>;

  /**
   * AS VENDAS QUEBRADAS PELO CAMPO `cor` DA PECA — 16/11/2026.
   *
   * SEM JANELA E O HISTORICO INTEIRO, igual ao `receitaPorEmpresa`.
   *
   * A DEVOLUCAO NAO ABATE, e e a mesma clausula do `itensMaisVendidos`:
   * `m.saida` sozinho. Abater peca a peca ja produziu linha negativa aqui ao
   * lado, e a agente apagou a linha ao responder.
   *
   * A ETIQUETA VEM JUNTO E ENTRA NO GROUP BY porque e a SEGUNDA FONTE do
   * metal: das 166 pecas JEWEL sem `cor`, 53 nomeiam o metal na etiqueta.
   */
  /**
   * O RECORTE DE VENDEDORAS — 17/11/2026.
   *
   * `null` e SEM RECORTE (a loja inteira); uma lista e exatamente aquelas;
   * e `[]` e NINGUEM, nao todos. A distincao e a mesma que o
   * `vendedorasDaEquipeDoUsuario` ja faz de proposito com duas consultas em
   * vez de um JOIN: sem equipe e `null`, equipe vazia e recorte legitimo que
   * nao devolve nada.
   *
   * Tres chamadores: a loja manda `null`, a gerente manda a equipe dela, e a
   * vendedora manda o proprio id.
   */
  vendasPorMetal(
    janela?: JanelaDeVendas,
    vendedoras?: string[] | null,
  ): Promise<VendasPorCor[]>;
  /**
   * AS VENDAS QUEBRADAS PELO TIPO DA PEÇA — 16/11/2026.
   *
   * SEM JANELA É O HISTÓRICO INTEIRO, igual ao `vendasPorMetal`.
   *
   * COM `anterior`, a mesma varredura traz os dois recortes lado a lado — é
   * como se compara ano com ano sem deixar a subtração para o modelo.
   *
   * A DEVOLUÇÃO NÃO ABATE: `m.saida` sozinho, a mesma cláusula do
   * `itensMaisVendidos`.
   */
  vendasPorTipo(
    janela?: JanelaDeVendas,
    anterior?: JanelaDeVendas,
    /** Ver `vendedoras` no `vendasPorMetal`. */
    vendedoras?: string[] | null,
  ): Promise<VendasPorTipoCru[]>;

  /**
   * AS VENDAS QUEBRADAS PELA PEDRA — 16/11/2026.
   *
   * UMA PEÇA COM DUAS PEDRAS CONTA NAS DUAS, e quem decide isso é o caso de
   * uso: aqui só viajam as duas fontes cruas.
   */
  /**
   * COM `porVendedora`, a mesma consulta quebra por quem vendeu — é o que
   * responde "quem vendeu mais diamante". A pedra NÃO é coluna: ela sai do
   * dicionário, no caso de uso, e por isso o filtro por pedra não pode
   * acontecer aqui.
   */
  vendasPorPedra(
    janela?: JanelaDeVendas,
    anterior?: JanelaDeVendas,
    porVendedora?: boolean,
    /** Ver `vendedoras` no `vendasPorMetal`. */
    vendedoras?: string[] | null,
  ): Promise<VendasPorPedraCru[]>;


  /** Ver `prefixos` no `rankingPorFamilia`. */
  rankingPorFamiliaNoMes(
    mes: number,
    familia: string,
    prefixos: string[] | null,
    porAno: number,
  ): Promise<VendedoraPorFamiliaNoAno[]>;
}

export const VENDAS_MOVIMENTACAO_REPOSITORY = Symbol(
  'IVendasMovimentacaoRepository',
);
