/**
 * A MOVIMENTAÇÃO LIDA COMO VENDA, escrita uma vez só — 01/10/2026.
 *
 * ==========================================================================
 * ESTA É A REGRA PELA QUAL A TELA E O WHATSAPP DÃO O MESMO NÚMERO.
 *
 * Em 25/09 a tela de Vendas passou a ler `movimentacoes` em vez de `vendas`, e
 * a ferramenta da Anastasia (commit 34bc8c3, da mesma manhã) já descontava a
 * devolução. Com a tela somando só as saídas, a MESMA pergunta tinha duas
 * respostas: R$ 1.213.806,50 na tela e R$ 934.126,50 no WhatsApp, para agosto
 * de 2026. Decisão do Lucas ao ver a divergência:
 *
 *   "front e o whats devem estar alinhados.. sem informacoes divergentes"
 *
 * Duas respostas para a mesma pergunta é pior que qualquer uma das duas.
 *
 * O arquivo existe porque em 01/10 o Analytics passou a ler a movimentação
 * também, e a regra estava numa `const` privada do repositório de Vendas.
 * Copiá-la seria criar duas versões do que decide a receita — e a divergência
 * já custou uma correção uma vez.
 * ==========================================================================
 *
 * O STATUS É DERIVADO, E OS TRÊS SÃO DE VERDADE:
 *
 *   saída   + ativo   -> concluida
 *   entrada + ativo   -> devolvida   (a devolução de venda)
 *   ativo = false     -> cancelada   (é como o ERP cancela: reenvio com false)
 *
 * `pendente` não existe: a movimentação só nasce depois de o fato acontecer.
 *
 * O ALIAS É PARÂMETRO porque as consultas o trocam: a tabela entra como `m`,
 * mas dentro de uma CTE de recorte ela vira `f`. Passar o alias errado é erro
 * de SQL na hora — é o tipo de engano que aparece no primeiro teste.
 */

/** A tabela crua, para quem monta o `FROM`. */
export const MOVIMENTACOES = 'movimentacoes';

/**
 * O status derivado — usado tanto no `SELECT` quanto no filtro.
 *
 * Os dois usos TÊM que concordar: filtrar por `concluida` e receber linhas
 * marcadas de outro jeito seria um defeito mudo.
 */
/**
 * O TERCEIRO RAMO CHEGOU AQUI UM DIA DEPOIS — 19/11/2026.
 *
 * ==========================================================================
 * 152 LINHAS "DEVOLVIDA" EM NOVEMBRO, E SÓ 3 ERAM.
 *
 * A tela de Vendas listava 181 documentos no mês — 29 vendas, 3 devoluções
 * e 149 CONSIGNAÇÕES, todas rotuladas "Devolvida". O Lucas viu pelos
 * valores: R$ 696.600,00 numa "devolução" é maleta, não peça que voltou.
 *
 * A consignação tem `entrada`, então caía no ramo da devolução — o mesmo
 * defeito de 18/11, sobrevivendo neste canto. A lista das AGENTES ganhou o
 * terceiro ramo naquele dia; esta constante, que a TELA usa, ficou para
 * trás. Duas cópias da mesma regra, e só uma consertada.
 *
 * A ORDEM É A REGRA, e vale para os três: cancelada antes de tudo, porque
 * uma consignação cancelada é cancelada; consignação antes de devolvida,
 * porque ela tem `entrada` e cairia lá.
 * ==========================================================================
 */
export const STATUS_DE_MOVIMENTACAO = `
  CASE
    WHEN NOT m.ativo           THEN 'cancelada'
    WHEN m.saida AND m.entrada THEN 'consignacao'
    WHEN m.entrada             THEN 'devolvida'
    ELSE                            'concluida'
  END`;

/**
 * OS TRÊS CONCEITOS, ONDE HAVIA DOIS — 18/11/2026.
 *
 * ==========================================================================
 * CONSIGNAÇÃO NÃO É VENDA NEM DEVOLUÇÃO. É A MESMA JOIA MUDANDO DE LUGAR.
 *
 * O ERP tem quatro operações, e as bandeiras as seguem sem exceção nenhuma
 * em 8.240 documentos (medido na cópia de produção, 18/11):
 *
 *   VENDA ................... saída, sem entrada .....  1.729 · R$ 73,2 mi
 *   DEVOLUCAO DE VENDA ...... entrada, sem saída .....    129 · R$  4,6 mi
 *   CONSIGNACAO ............. AS DUAS ...............  2.822 · R$  2,2 bi
 *   RETORNO DE CONSIGNACAO .. AS DUAS ...............  3.560 · R$  2,7 bi
 *
 * Até aqui `vendaEfetiva` era `saida AND ativo`, e `devolucaoEfetiva` era
 * `entrada AND ativo`. A consignação tem as duas bandeiras, então entrava
 * nas DUAS — como venda e como devolução, no mesmo fôlego.
 *
 * O estrago apareceu em 17/11, quando a gestora perguntou o total do mês e a
 * Anastasia respondeu *"o total das 178 vendas foi R$ 54.536.432,00"*. São
 * 29 vendas e R$ 1.893.544; os outros 149 documentos e R$ 52,6 milhões eram
 * joia indo e voltando.
 *
 * A RECEITA FICAVA CERTA POR ACIDENTE, e é esse o disfarce que o escondeu
 * por três anos: a consignação somava de um lado e subtraía do outro, no
 * mesmo valor. Errado estava tudo o que CONTA documento ou soma só a saída —
 * a contagem, o bruto, o ticket médio e a lista detalhada.
 *
 * A REGRA É A BANDEIRA, E NÃO O NOME DA OPERAÇÃO. O nome pode virar
 * "REMESSA" ou "CONDICIONAL" amanhã; "saiu e entrou ao mesmo tempo" descreve
 * o que a coisa É. E é a mesma leitura que `Movimentacao.pontaDoTerceiro`
 * faz desde sempre: `if (props.saida === props.entrada) return null`.
 * ==========================================================================
 */

/** Venda de verdade: saiu e NÃO voltou no mesmo documento. */
export function ehVenda(alias = 'm'): string {
  return `${alias}.saida AND NOT ${alias}.entrada AND ${alias}.ativo`;
}

/** Devolução de venda: entrou e não saiu. Documento próprio, não estorno. */
export function ehDevolucao(alias = 'm'): string {
  return `${alias}.entrada AND NOT ${alias}.saida AND ${alias}.ativo`;
}

/**
 * Consignação, ida ou retorno: as duas bandeiras.
 *
 * Não entra em venda nem em devolução. Existe nomeada para quem precisar
 * CONSULTÁ-LA — "quantas consignações tivemos em novembro" é pergunta
 * legítima da gestão, e sem este fragmento ela viraria `saida AND entrada`
 * escrito à mão na próxima consulta.
 */
export function ehConsignacao(alias = 'm'): string {
  return `${alias}.saida AND ${alias}.entrada AND ${alias}.ativo`;
}

/**
 * A venda que conta. É o equivalente a `status = 'concluida'`.
 *
 * Apelido de `ehVenda`: sete arquivos chamam este nome, e o que mudou em
 * 18/11 foi a REGRA, não o nome.
 */
export function vendaEfetiva(alias = 'm'): string {
  return ehVenda(alias);
}

/** A devolução que conta. Apelido de `ehDevolucao` — ver `vendaEfetiva`. */
export function devolucaoEfetiva(alias = 'm'): string {
  return ehDevolucao(alias);
}

/**
 * O TOTAL VENDIDO: soma das vendas, SEM descontar devolução.
 *
 * ==========================================================================
 * DESCONTAR MISTURA PERÍODOS, E FOI ISSO QUE QUEBROU A TELA.
 *
 * Em 19/11 a tela de Vendas dizia R$ 1.860.578,00 em novembro e a
 * Anastasia dizia R$ 1.893.544,00. Os dois certos pela própria regra, e
 * ninguém conseguia dizer qual mentia olhando a tela.
 *
 * A devolução de novembro NÃO É de uma venda de novembro. Medido na cópia:
 *
 *   doc 1582071  devolvido 05/11/2026   vendido em 20/04/2026
 *   doc 1582590  devolvido 05/11/2026   vendido em 23/09/2026
 *   doc 1588504  devolvido 10/11/2026   vendido em 02/05/2025
 *
 * As três conferidas peça a peça, pelo `valor_unitario` dos dois lados. O
 * card tirava R$ 32.966 de um mês em que esse dinheiro nunca entrou — e a
 * Bianca "perdia" R$ 12.526 por uma peça que vendeu em maio do ano
 * passado.
 *
 * É o mesmo defeito do "294 saíram, 309 voltaram" da consignação: dois
 * fluxos de períodos diferentes subtraídos um do outro. Lá dava para ver,
 * porque eram duas linhas. Aqui estava somado num número só.
 *
 * O `receitaLiquida` CONTINUA VALENDO para quem quer o líquido — carteira,
 * fidelidade e Analytics seguem nele. O que mudou foi quem a tela usa.
 * ==========================================================================
 */
export function totalVendido(alias = 'm', campo = 'valor'): string {
  return `COALESCE(sum(${alias}.${campo}) FILTER (WHERE ${vendaEfetiva(alias)}), 0)`;
}

/**
 * A RECEITA: soma das saídas MENOS soma das devoluções.
 *
 * Expressão de agregação — vai num `SELECT` com `GROUP BY`, ou sozinha sobre o
 * recorte inteiro. A contagem de vendas NÃO desconta: 20 vendas e 6 devoluções
 * continuam sendo 20 vendas, para dar para reconciliar o número na tela.
 */
export function receitaLiquida(alias = 'm', campo = 'valor'): string {
  return (
    `COALESCE(sum(${alias}.${campo}) FILTER (WHERE ${vendaEfetiva(alias)}), 0)` +
    ` - COALESCE(sum(${alias}.${campo}) FILTER (WHERE ${devolucaoEfetiva(alias)}), 0)`
  );
}

/**
 * O MESMO ABATIMENTO, por linha e não por grupo — para quem soma depois.
 *
 * A devolução entra negativa, e a linha cancelada entra zerada. Serve à série
 * mensal, em que o `SUM` acontece sobre o `generate_series` e não sobre a
 * tabela.
 */
export function valorAssinado(alias = 'm', campo = 'valor'): string {
  // A ORDEM DOS RAMOS É A REGRA. A consignação tem `entrada` ligada, então
  // com o ramo dela DEPOIS ela cairia no da devolução e entraria NEGATIVA na
  // série mensal — pior que o defeito antigo, em que ao menos se cancelava.
  return `CASE
    WHEN NOT ${alias}.ativo THEN 0
    WHEN ${alias}.saida AND ${alias}.entrada THEN 0
    WHEN ${alias}.entrada   THEN -${alias}.${campo}
    ELSE                          ${alias}.${campo}
  END`;
}

/**
 * A FORMA DE PAGAMENTO VEM PELO `_id_erp`, E ISSO É UM CONTORNO.
 *
 * `movimentacoes_pagamentos.forma_pagamento_id` está NULO nas 1.730 parcelas —
 * a ingestão não resolve essa ponta, e é um defeito nosso, pequeno e separado.
 * Mas o dado está lá: o integrador manda o NOSSO uuid dentro de
 * `forma_pagamento_id_erp`, e os 15 valores distintos casam todos com
 * `formas_pagamento`.
 *
 * QUANDO A INGESTÃO FOR CORRIGIDA este `COALESCE` continua certo — ele já
 * prefere o id resolvido.
 *
 * E o NOME vem da tabela, não do enum de oito valores da tela: são 31 formas
 * reais (Promissória, Boleto, Cheque, Stone, Rede, Cielo...). Decisão do Lucas:
 * "coloque o que nos temos na tabela".
 */
export function formaPagamentoDe(alias = 'mp'): string {
  return `COALESCE(${alias}.forma_pagamento_id, ${alias}.forma_pagamento_id_erp::uuid)`;
}

/**
 * O VALOR DO ITEM, COM SINAL — para a meta por produto.
 *
 * A devolucao TEM itens (126 linhas em 101 documentos), entao a peca que voltou
 * nao pode continuar contando para a meta de quem a vendeu. Mesma regra da
 * receita, um nivel abaixo: a movimentacao decide o sinal, o item da o valor.
 *
 * `movimentacoes_itens` nao tem `valor_total_item` — o total e
 * `quantidade * valor_unitario`, e isso fecha com o valor do documento em 1.287
 * de 1.287.
 */
export function itemAssinado(mov = 'm', item = 'i'): string {
  const total = `${item}.quantidade * ${item}.valor_unitario`;
  // A PECA CONSIGNADA NAO CONTA PARA A META — 18/11/2026. Tres de cada quatro
  // pecas vendidas passaram antes por uma consignacao (1.591 de 2.183), entao
  // contar as duas pernas fazia a mesma peca bater meta duas vezes. A ordem
  // importa pelo mesmo motivo do `valorAssinado`.
  return `CASE
    WHEN NOT ${mov}.ativo THEN 0
    WHEN ${mov}.saida AND ${mov}.entrada THEN 0
    WHEN ${mov}.entrada   THEN -(${total})
    ELSE                        (${total})
  END`;
}

/**
 * AS EMPRESAS DO GRUPO, para o filtro das telas — 02/10/2026.
 *
 * ==========================================================================
 * TODAS AS ATIVAS, E NAO SO AS QUE VENDERAM — decisao do Lucas.
 *
 * Comecou listando so as duas com movimento, e estava errado: a pergunta
 * "a AT HOME vendeu alguma coisa?" nao tem resposta se a AT HOME nao esta
 * na lista. Empresa ausente parece empresa que nao existe; empresa
 * selecionada com a tela vazia RESPONDE — e e o mesmo comportamento do
 * filtro de empresa da tela de Produtos.
 *
 * Hoje seis das oito devolvem tela vazia, e isso e informacao.
 * ==========================================================================
 *
 * A LISTA SAI DO MESMO LUGAR NAS DUAS TELAS. Vendas e Analytics precisam das
 * MESMAS opcoes — uma empresa que aparece num filtro e nao no outro e a mesma
 * classe de divergencia que o abatimento da devolucao criou em 25/09.
 */
export const EMPRESAS_DO_GRUPO = `
  SELECT e.id, e.nome
    FROM empresas e
   WHERE e.ativo
   ORDER BY e.nome
`;
