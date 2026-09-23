import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { TratarFotoUseCase } from '../../../catalogos/application/use-cases/tratar-foto.use-case';
import {
  LIMITE_BYTES,
  MIMES_IMAGEM,
  PASTA_ORIGINAIS,
  PASTA_PENDENTES,
  pastaDoCatalogo,
  type IArmazenamento,
} from '../../../catalogos/domain/ports/armazenamento.port';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
  CONFERENCIA_FOTO,
} from '../../../catalogos/domain/ports/injection-tokens';
import type {
  IConferenciaFoto,
  VereditoFoto,
} from '../../../catalogos/domain/ports/conferencia-foto.port';
import type {
  CatalogoAberto,
  FotoItem,
  ICatalogoRepository,
} from '../../../catalogos/domain/ports/repositories/catalogo-repository.port';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';
import { ListarProdutosUseCase } from '../../../produtos/application/use-cases/listar-produtos.use-case';
import {
  SessaoCatalogoService,
  type CodigoEsperado,
  type FotoPendente,
  type OpcaoPeca,
} from '../sessao-catalogo.service';

/**
 * Parcelamento padrao.
 *
 * O ERP nao guarda parcelamento — so o preco. Nos catalogos reais conferidos
 * no levantamento, 10X aparece em quase tudo e 6X em duas pecas. Assumir 10X
 * erra o VALOR DA PARCELA nos casos raros, nunca o preco; quem souber que a
 * peca e 6X escreve "6x" na legenda.
 */
const PARCELAS_PADRAO = 10;

/**
 * Permissao que habilita o assunto catalogo no canal interno. Mora aqui, e
 * nao no modulo de auth, porque quem define o que e "poder mandar foto de
 * peca" e este fluxo.
 */
export const PERMISSAO_CATALOGO = 'catalogo:write';

/** `CO26185`, `BR26252` — duas letras e digitos. E o formato dos catalogos da casa. */
const RE_CODIGO = /\b([A-Z]{2}\d{3,})\b/i;

/** `10x`, `6 X` — parcelamento informado na legenda. */
const RE_PARCELAS = /\b(\d{1,2})\s*x\b/i;

/**
 * `15%`, `12 %` — o JURO do parcelamento, sobre o valor a vista.
 *
 * Decidido com o Lucas em 01/09/2026: o numero e juro, nao desconto. Entao
 * `12x 15%` em R$44.900,00 e 44.900 x 1,15 = R$51.635,00, parcelado em 12.
 */
const RE_JUROS = /(\d{1,3})\s*%/;

/**
 * `sem juros`, `s/ juros`, `sem acrescimo` — juro ZERO, e nao ausencia dele.
 *
 * DESDE 04/09/2026 OS DOIS DAO O MESMO NUMERO: ausencia de juro passou a valer
 * zero, no lugar da regra da casa que dividia por 0,80 e embutia 25%. Entao
 * dizer "sem juros" nao muda mais a conta.
 *
 * A forma continua sendo reconhecida, e nao e sobra: escrever `10x sem juros`
 * na legenda registra que alguem CONFERIU o parcelamento daquela peca, e o
 * silencio nao registra nada. Quando o preco sair errado, essa diferenca e a
 * primeira coisa que se procura.
 */
const RE_SEM_JUROS =
  /\bsem\s*juros\b|\bs\s*\/?\s*juros\b|\bsem\s*acr[eé]scimo\b/i;

// A BARRA E OPCIONAL de proposito. `lerJuros` compara sobre o texto
// NORMALIZADO, e o `normalizar` troca a barra por espaco — entao `s/ juros`
// chega ali como `s juros`. Exigindo a barra, a forma abreviada nunca casaria,
// e a peca sairia com o acrescimo padrao: o oposto do que foi pedido.

/** `0042`, `#42`, `42` — o numero do catalogo. */
const RE_NUMERO = /#?\b(\d{1,6})\b/;

/**
 * ===========================================================================
 * O QUE FAZ UM TEXTO SER BUSCA DE PECA — E POR QUE PRECISA DE UMA PORTA.
 *
 * Enquanto uma foto espera codigo, TODO texto daquele remetente passa por
 * aqui. Sem porta nenhuma, um "quanto vendi hoje?" digitado com a foto
 * pendurada viraria busca de produto e receberia "nao achei nenhuma peca com
 * isso" — a pergunta dela ignorada, que e exatamente o defeito que o
 * vocabulario fechado da aprovacao existe para evitar.
 *
 * Entao a busca so comeca quando o texto DIZ QUE PECA E. E natural: a
 * pergunta que a provoca e "me manda o codigo da peca", e quem nao sabe o
 * codigo responde "anel de esmeralda", nunca "de esmeralda" solto.
 *
 * O CUSTO ACEITO: buscar so pela pedra ("esmeralda gota") nao dispara. O
 * contrario — engolir conversa que era da Anastasia — custa mais caro, porque
 * ela nunca fica sabendo que a pergunta existiu.
 * ===========================================================================
 */
const RE_TIPO_PECA =
  /\b(anel|aneis|alianca|aliancas|brinco|brincos|colar|colares|corrente|correntes|gargantilha|gargantilhas|pingente|pingentes|pulseira|pulseiras|bracelete|braceletes|tornozeleira|tornozeleiras|berloque|berloques|broche|broches|piercing|piercings|relogio|relogios|joia|joias|peca|pecas|conjunto|conjuntos)\b/;

/**
 * O comando que refaz a foto que a IA nao tratou — e como a mensagem o cita.
 *
 * FRASE INTEIRA, e nao "de novo" solto no meio: "manda de novo o relatorio"
 * nao pode refazer foto nenhuma. Aceita as variacoes de quem digita rapido.
 */
const TENTA_DE_NOVO = 'tenta de novo';
const RE_TENTA_DE_NOVO =
  /^(pode )?(tenta|tente|tentar|tentando|refaz|refazer|faz|faca|trata|tratar) ?(de novo|novamente|outra vez|denovo)( por favor| pf| pfv)?$|^(de novo|denovo|novamente)$/;

/** `2`, `#2` — o numero da opcao na lista que eu acabei de mostrar. */
const RE_ESCOLHA = /^#?(\d{1,2})\b/;

/**
 * Teto de opcoes. Lista longa no WhatsApp nao ajuda ninguem — o mesmo numero
 * da consulta da vendedora, e pelo mesmo motivo.
 */
const MAX_OPCOES = 6;

/**
 * Quantas fotos penduradas voltam por mensagem.
 *
 * Cinco imagens ja sao uma rolagem inteira no celular. Acima disso a pessoa
 * perde de vista a primeira antes de responder a ultima — as que sobram vao
 * na proxima pergunta, depois que ela resolver estas.
 */
const MAX_REENVIO = 5;

/**
 * "e essa mesmo" quando ha UMA opcao so na lista.
 *
 * PORQUE EU PERGUNTEI. Mostrando uma peca so e dizendo "e ela?", exigir o
 * numero seria cobrar senha de quem eu mesmo chamei — a regra que ja custou
 * tres defeitos em 31/08.
 *
 * COM A LISTA DE UMA PECA NA TELA, O `sim` E DELA — mesmo com foto tratada
 * esperando veredito. Desde 11/09/2026 `aprovacao` devolve esse `sim` para
 * ca em vez de le-lo como aprovacao: a ultima pergunta feita foi "É ela?", e
 * uma pergunta por vez. Se a aprovacao ja tinha vindo antes, o codigo
 * escolhido publica junto — ver `anotarCodigo`.
 */
const PALAVRAS_CONFIRMA = [
  'sim',
  'isso',
  'isso mesmo',
  'essa',
  'essa mesmo',
  'e essa',
  'e ela',
  'exato',
  'confirma',
  'confirmo',
];

/**
 * Palavras que sao COMANDO, nao estilo.
 *
 * A fronteira de palavra nos dois lados e essencial: sem ela, "cat" casaria
 * dentro de "catalogo" (deixando "alogo") e "foto" dentro de "fotografia".
 */
const PALAVRAS_DE_COMANDO =
  /\b(catalogo|catálogo|cat|ref|referencia|referência|codigo|código|peca|peça|foto)\b/gi;

/**
 * ===========================================================================
 * O VOCABULARIO DA APROVACAO — E POR QUE ELE E FECHADO.
 *
 * A resposta a "ficou assim?" chega como texto livre no MESMO canal em que a
 * pessoa tambem conversa com a Anastasia. Se qualquer texto que nao fosse
 * "aprovo" virasse pedido de ajuste, um "quanto vendi hoje?" digitado com uma
 * foto pendurada iria parar no modelo de imagem — cobrado, demorado, e sem
 * resposta a pergunta que ela fez.
 *
 * Entao sao duas listas fechadas, e QUALQUER OUTRA COISA nao e resposta de
 * aprovacao: cai nos agentes de sempre. E deliberado errar para o lado de
 * "nao entendi como aprovacao" — o custo e ela repetir a palavra; o custo do
 * contrario e uma geracao perdida e a pergunta dela ignorada.
 *
 * Sem LLM aqui, pelo mesmo motivo dos avisos: e classificacao de uma palavra,
 * e um modelo so acrescentaria latencia, custo e uma superficie de injecao
 * onde hoje nao existe nenhuma.
 * ===========================================================================
 */
const PALAVRAS_APROVA = [
  'aprovo',
  'aprovado',
  'aprovada',
  'aprovar',
  // "APROVA" NAO ESTAVA AQUI, e foi o defeito do HML-16. Em 10/09 o Yerlon
  // respondeu "Aprova" a foto tratada, a palavra nao casou, e a frase caiu na
  // Anastasia — que respondeu "Aprovar o quê?". So a segunda tentativa, com
  // "Aprovo", passou.
  //
  // Decisao do Lucas em 11/09: TODA palavra de afirmacao aprova. O que impede
  // um "ok" de publicar foto que a pessoa nao viu nao e mais a lista curta — e
  // o relogio, em `aprovacao`.
  'aprova',
  'aprove',
  'pode aprovar',
  'pode colocar',
  'pode por',
  'pode ir',
  'pode publicar',
  'pode ser',
  'pode sim',
  'ok',
  'okay',
  'okey',
  'sim',
  'isso',
  'isso mesmo',
  'exato',
  'certo',
  'certinho',
  'perfeito',
  'perfeita',
  'otimo',
  'otima',
  'show',
  'top',
  'massa',
  'bacana',
  'legal',
  'lindo',
  'linda',
  'amei',
  'gostei',
  'adorei',
  'ficou bom',
  'ficou boa',
  'ficou otimo',
  'ficou otima',
  'ficou lindo',
  'ficou linda',
  'ficou perfeito',
  'ficou perfeita',
  'ficou show',
  'ta bom',
  'ta boa',
  'ta otimo',
  'ta otima',
  'ta perfeito',
  'ta lindo',
  'ta linda',
  'esta bom',
  'beleza',
  'blz',
  'fechado',
  'joia',
  'uhum',
  'aham',
];

// DE FORA, DE PROPOSITO: "pode" sozinho e "bom" sozinho. A palavra so precisa
// ABRIR a frase, e "pode refazer com fundo branco" e "bom dia" abririam com
// elas — o primeiro publicaria o que a pessoa mandou refazer.

/**
 * O joinha, o certo, o palminha. SAO LIDOS ANTES DO `normalizar`, que apaga
 * tudo que nao e letra ou digito: por ele, "👍" vira texto vazio e nunca casou
 * com nada. Vale a mensagem feita SO de emoji de aprovacao (com tom de pele e
 * variacao); "👍 mas muda o fundo" tem letra, e vai pelo caminho das palavras.
 */
const RE_EMOJI_APROVA =
  /^(?:\s*(?:\u{1F44D}|\u{1F44C}|\u{2705}|\u{2714}|\u{1F44F}|\u{1F64C}|\u{1F4AF}|\u{1F525}|\u{2764}|\u{1F60D}|\u{1F970}|\u{1F929})(?:\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF})?\u{FE0F}?)+\s*$/u;

/**
 * "ok, MAS muda o fundo" nao e aprovacao — e ressalva. O que vem depois do
 * "mas" decide: se for pedido de ajuste ou descarte, vale ele; se for outra
 * coisa, nao e veredito nenhum. Sem isso, a lista maior de afirmacoes
 * publicaria justamente a foto que a pessoa pediu para mudar.
 */
const RE_RESSALVA = /^(mas|porem|so que)\b\s*/;

/**
 * Pedido de mudanca. O que vem DEPOIS da palavra e a instrucao para a IA.
 *
 * REPARE QUE "nao" SOZINHO NAO ESTA AQUI, e a ausencia e o ponto: "nao sei",
 * "nao precisa", "nao consegui ver" sao conversa, e um "nao" solto na lista
 * mandaria as tres para o modelo de imagem. So entram as formas em que a
 * negativa e inequivocamente sobre a foto.
 */
const PALAVRAS_AJUSTA = [
  'ajusta',
  'ajuste',
  'ajustar',
  'muda',
  'mudar',
  'troca',
  'trocar',
  'refaz',
  'refazer',
  'de novo',
  'reprova',
  'reprovar',
  'nao gostei',
  'nao ficou bom',
  'nao ficou',
  'nao curti',
];

/**
 * Jogar fora. A peca nunca entrou no catalogo e nao vai entrar.
 *
 * SO ESTA LISTA APAGA DE VERDADE. `ajusta` refaz e `aprovo` publica; aqui a
 * linha e os arquivos somem. Por isso as palavras sao inequivocas — nada de
 * "nao" nem "deixa": tem de ser um verbo de descarte.
 */
const PALAVRAS_DESCARTA = [
  'descarta',
  'descartar',
  'descarte',
  'apaga',
  'apagar',
  'deleta',
  'deletar',
  'exclui',
  'excluir',
  'joga fora',
  'esquece',
  'cancela',
];

/** `aprovo todas`, `todas`, `todos` — vale para a fila inteira. */
const RE_TODAS = /\btod[ao]s\b/;

type Veredito =
  | { tipo: 'APROVA'; todas: boolean }
  | { tipo: 'AJUSTA'; pedido: string | null }
  | { tipo: 'DESCARTA'; todas: boolean }
  | { tipo: 'NENHUM' };

/**
 * A resposta a "ficou assim?".
 *
 * Compara sobre o texto NORMALIZADO — minusculas, sem acento e sem pontuacao —
 * para "Aprovo!", "aprovo" e "APROVO" serem a mesma coisa, e para nao ser
 * preciso repetir cada palavra com e sem acento.
 *
 * A palavra tem de ABRIR a frase. "Nao sei se aprovo essa" contem "aprovo" e
 * nao e aprovacao nenhuma; exigindo o inicio, cai em NENHUM e vai para os
 * agentes, que e o lado seguro de errar.
 */
function lerVeredito(texto: string): Veredito {
  if (RE_EMOJI_APROVA.test(texto.trim())) {
    return { tipo: 'APROVA', todas: false };
  }

  const n = normalizar(texto);
  if (!n) return { tipo: 'NENHUM' };

  // O DESCARTE E CONFERIDO PRIMEIRO. Ele e o unico irreversivel, e uma frase
  // que casasse nas duas listas nao pode acabar publicando o que a pessoa
  // mandou jogar fora.
  if (PALAVRAS_DESCARTA.some((p) => n === p || n.startsWith(`${p} `))) {
    return { tipo: 'DESCARTA', todas: RE_TODAS.test(n) };
  }

  // A MAIS LONGA que casar, pelo mesmo motivo do ajuste abaixo: o que sobra
  // depois dela e onde se procura a ressalva.
  const aprova = PALAVRAS_APROVA.filter(
    (p) => n === p || n.startsWith(`${p} `),
  ).sort((a, b) => b.length - a.length)[0];
  if (aprova) {
    const resto = n.slice(aprova.length).trim();
    const ressalva = resto.match(RE_RESSALVA);
    if (ressalva) {
      const depois = lerVeredito(resto.slice(ressalva[0].length));
      return depois.tipo === 'AJUSTA' || depois.tipo === 'DESCARTA'
        ? depois
        : { tipo: 'NENHUM' };
    }
    return { tipo: 'APROVA', todas: RE_TODAS.test(n) };
  }

  // A MAIS LONGA que casar, e nao a primeira da lista: "nao ficou bom" e
  // "nao ficou" casam as duas, e pela primeira sobraria "bom" como pedido de
  // estilo — uma instrucao que ninguem deu.
  const ajusta = PALAVRAS_AJUSTA.filter(
    (p) => n === p || n.startsWith(`${p} `),
  ).sort((a, b) => b.length - a.length)[0];
  if (ajusta) {
    const resto = n.slice(ajusta.length).trim();
    return { tipo: 'AJUSTA', pedido: resto.length >= 3 ? resto : null };
  }

  return { tipo: 'NENHUM' };
}

/**
 * O que sobra da legenda vira pedido de estilo para a IA — "fundo rosa",
 * "mais claro". Menos de tres caracteres e ruido de pontuacao, nao instrucao.
 */
function limparPedido(resto: string): string | null {
  const limpo = resto
    .replace(PALAVRAS_DE_COMANDO, ' ')
    .replace(/[#\s]+/g, ' ')
    .trim();
  return limpo.length >= 3 ? limpo : null;
}

/**
 * Resposta CURTA a foto tratada: ate tres palavras, e sem ser pergunta.
 *
 * E a fronteira da dica "responde aprovo, ajusta ou descarta". O vocabulario e
 * fechado para um "quanto vendi hoje?" digitado com foto pendurada chegar na
 * Anastasia — e a pergunta continua chegando: tem "?". O que ganha a dica e o
 * "Aprova" que a lista nao conhecia, que foi o caso do Yerlon.
 */
function ehRespostaCurta(texto: string): boolean {
  if (texto.includes('?')) return false;
  const n = normalizar(texto);
  return n.length > 0 && n.split(' ').length <= 3;
}

/**
 * Palavras que so ligam a frase. Tiradas elas, "e o 0003" e "0003".
 */
const PALAVRAS_DE_LIGACAO = new Set([
  'e',
  'o',
  'a',
  'os',
  'as',
  'do',
  'da',
  'de',
  'dos',
  'das',
  'no',
  'na',
  'pro',
  'pra',
  'para',
  'ao',
  'eh',
  'esse',
  'essa',
  'este',
  'esta',
  'numero',
  'num',
  'vai',
  'vao',
  'sao',
  'foto',
  'fotos',
  'catalogo',
  'cat',
  'codigo',
  'ref',
  'referencia',
  'peca',
]);

/** O que sobrou do texto e so ligacao — nao ha outro assunto nele. */
function soLigacao(resto: string): boolean {
  return normalizar(resto)
    .split(' ')
    .filter(Boolean)
    .every((p) => PALAVRAS_DE_LIGACAO.has(p));
}

/**
 * ===========================================================================
 * "QUERO MANDAR FOTO PRO CATALOGO" — A INTENCAO ANTES DA FOTO.
 *
 * Em 10/09 o Yerlon, ADM, escreveu "Quero adicionar fotos ao catálogo #0001".
 * Texto de ADM e da Anastasia, e ela respondeu que catalogo "fica fora do meu
 * alcance". Estava certa sobre si — e o canal que sabia fazer nunca ouviu.
 *
 * POR PALAVRA, SEM LLM, como o resto do modulo: e classificacao de uma frase.
 * Pede FOTO e, junto, CATALOGO ou um verbo de envio. So "catalogo" nao basta:
 * "quanto o catalogo vendeu?" e pergunta de gestao.
 * ===========================================================================
 */
const RE_FALA_FOTO = /\b(foto|fotos|imagem|imagens)\b/;
const RE_FALA_CATALOGO = /\b(catalogo|catalogos)\b/;

/**
 * "Em aberto", "pendente", "esperando", "para aprovar" — o que ainda nao foi
 * respondido.
 *
 * ==========================================================================
 * "APROVAR" ENTROU DEPOIS, E A PRIMEIRA VERSAO ERROU AO DEIXA-LO FORA.
 *
 * Tirei a palavra com medo de que "quero mandar foto PARA APROVAR" virasse
 * pergunta em vez de envio. O Lucas perguntou "tem foto para aprovar?" — a
 * forma mais natural de todas — e recebeu o menu.
 *
 * A separacao certa nao e a palavra, e o VERBO DE ENVIO: quem diz "mandar",
 * "enviar", "subir" esta anunciando o que vai fazer; quem nao diz nenhum
 * deles esta perguntando. Ver `falaDeFotosPendentes`.
 * ==========================================================================
 */
const RE_FALA_PENDENTE =
  /\b(aberto|abertos|aberta|abertas|pendente|pendentes|esperando|aguardando|faltando|falta|aprovar|aprovacao|aprovacoes)\b/;

/** O que a pergunta pode chamar de peca. Mais largo que `RE_FALA_FOTO`. */
const RE_FALA_FOTO_OU_PECA = /\b(foto|fotos|imagem|imagens|peca|pecas)\b/;
const RE_FALA_ENVIO =
  /\b(mandar|mando|manda|enviar|envio|envia|adicionar|adiciono|colocar|coloco|botar|subir|incluir)\b/;

/**
 * ===========================================================================
 * "CONSULTAR PEÇA" — O PEDIDO DE CONSULTA SEM O MENU.
 *
 * Em 16/09/2026 o Lucas escreveu "consultar peça" pelo WhatsApp, com o perfil
 * de catalogo, e recebeu a lista de catalogos abertos. O menu tinha expirado e
 * o texto caiu no chao do canal. O proprio menu promete "ou me diz o que
 * precisa" — e a frase mais obvia nao era entendida.
 *
 * POR PALAVRA, SEM LLM, pelo mesmo motivo da intencao de foto: e classificar
 * uma frase, e a garantia tem de ser de codigo, nao de um modelo acertar.
 * ===========================================================================
 */
const RE_FALA_CONSULTA =
  /\b(consultar|consulta|consulto|pesquisar|pesquisa|procurar|procuro|buscar|busca|preco|precos|valor|quanto|custa)\b/;

/**
 * Palavras do PEDIDO, e nao da peca — saem antes de procurar.
 *
 * A busca exige TODAS as palavras (`palavrasDaBusca`, no repositorio de
 * produtos). "Quero o anel de diamante" procuraria tambem "quero", e nenhuma
 * etiqueta tem "quero": a busca voltaria vazia por causa do verbo.
 *
 * As de ate dois caracteres ("o", "de") nao precisam estar aqui — o
 * repositorio ja as descarta.
 */
const PALAVRAS_DO_PEDIDO = new Set([
  'quero', 'queria', 'gostaria', 'preciso', 'poderia', 'pode', 'consegue',
  'consultar', 'consulta', 'consulto', 'pesquisar', 'pesquisa', 'procurar',
  'procuro', 'buscar', 'busca', 'ver', 'saber', 'mostra', 'mostrar',
  'peca', 'pecas', 'preco', 'precos', 'valor', 'quanto', 'custa', 'custo',
  'tem', 'qual', 'quais', 'sobre', 'essa', 'esse', 'esta', 'este', 'uma',
  'umas', 'uns', 'dos', 'das', 'para', 'pra', 'por', 'favor', 'aqui', 'ajuda',
  'voce', 'mim',
]);

/**
 * O que sobra do texto para procurar: sem as palavras do pedido e sem
 * pontuacao. Devolve o texto CRU nas palavras que ficam — `normalizar` tira
 * acento, e "alianca" nao casa com "ALIANÇA" no ILIKE.
 */
function termoDaConsulta(texto: string): string {
  return texto
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[?!.,;:"'()]+/g, ''))
    .filter((p) => p && !PALAVRAS_DO_PEDIDO.has(normalizar(p)))
    .join(' ');
}

/**
 * A imagem como a APLICACAO a conhece. Espelha o que o webhook extrai, mas
 * declarada aqui: o mesmo criterio do audio — a camada de aplicacao nao
 * importa tipo da infra, senao trocar de provedor de WhatsApp mexeria nos
 * casos de uso.
 */
export interface ImagemInterna {
  /** Endereco do arquivo ja decifrado pelo provedor. Nulo = nao deu para baixar. */
  url: string | null;
  mimetype: string;
}

export interface FotoDoCanal {
  /** Identificador do remetente ja resolvido (contem telefone). */
  de: string;
  /** Rotulo de quem fotografou. Nome do staff, nunca o telefone. */
  nomeRemetente: string;
  legenda: string;
  imagem: ImagemInterna;
}

export interface RespostaFoto {
  resposta: string | null;
  motivo: string;
}

/**
 * A foto da peca chegando pelo WhatsApp.
 *
 * ==========================================================================
 * A ORDEM DAS OPERACOES NAO E ARBITRARIA: BAIXAR PRIMEIRO, PERGUNTAR DEPOIS.
 *
 * O WAHA apaga a midia decifrada em 30 minutos. Se o fluxo fosse "perguntar de
 * qual catalogo e, e so entao baixar", bastaria a pessoa sair para almocar
 * para a foto sumir — e ela nao teria como saber, porque ja tinha mandado.
 * Entao grava-se o arquivo assim que ele chega, e a classificacao acontece
 * depois, sobre um arquivo que ja e nosso.
 * ==========================================================================
 *
 * O CICLO COMPLETO DA FOTO, ja fechado:
 *
 *   chega  ->  originais/  ->  IA  ->  fotos/  ->  "ficou assim?"  ->  APROVADA
 *                                        ^                |
 *                                        +--- "ajusta ..." +
 *
 * A ida ate a IA e a volta com a versao tratada estao em `tratarEAvisar`; a
 * leitura do sim e do "muda isso" esta em `aprovacao`.
 */
@Injectable()
export class ProcessarFotoCatalogoUseCase {
  private readonly logger = new Logger(ProcessarFotoCatalogoUseCase.name);

  /** O temporizador da varredura das fotos vencidas. Um so, reagendado. */
  private varredura: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly catalogos: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtos: IProdutoRepository,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
    private readonly sessao: SessaoCatalogoService,
    private readonly tratar: TratarFotoUseCase,
    // A MESMA BUSCA DA ELENA, de 20/08: varre descricao, categoria, familia,
    // colecao, pedra, cor e codigo, com AND entre as palavras e OR entre as
    // colunas — "anel de esmeralda" casa com "ANEL VINTAGE ESMERALDA". Nao
    // havia por que escrever uma segunda.
    private readonly listarProdutos: ListarProdutosUseCase,
    // Quem OLHA a foto antes de gastar a geracao — ver `foto`.
    @Inject(CONFERENCIA_FOTO)
    private readonly conferencia: IConferenciaFoto,
  ) {}

  /**
   * Trata a foto e manda o resultado para quem a enviou.
   *
   * RODA FORA DA RESPOSTA, e por isso nao tem `await` de quem a chama: gerar
   * imagem leva 10 a 30 segundos, e segurar o webhook por esse tempo faria o
   * WAHA reenviar o evento — a mesma foto entraria duas vezes.
   *
   * Nada aqui pode estourar para fora: a foto ja esta gravada, e a pessoa ja
   * recebeu a confirmacao. Falhar custa a versao tratada, nunca a imagem.
   */
  private async tratarEAvisar(
    fotoId: string,
    pedidoDeEstilo: string | null,
    chat: string,
  ): Promise<void> {
    // "A CAMINHO" DESDE ANTES DE TRATAR. O `tratar` grava EM_APROVACAO no
    // banco antes de a imagem sair, e nesse intervalo o banco diz "pode
    // aprovar" sobre uma foto que ninguem viu. E o intervalo em que o "Ok" de
    // uma mensagem anterior publicaria o que nao foi visto — ver `foiVista`.
    this.sessao.marcarEmEnvio(chat, fotoId);
    let enviada = false;

    try {
      const r = await this.tratar.execute(fotoId, pedidoDeEstilo);
      if (!r) return;

      // A IA NAO TRATOU: a foto voltou a RECEBIDA. Lembro qual foi, para o
      // "tenta de novo" refaze-la — sem isso ela ficava fora da aprovacao e
      // do painel, e o unico jeito era mandar outra. Ver `tentarDeNovo`.
      if (r.foto.status === 'RECEBIDA') {
        this.sessao.marcarFalha(chat, fotoId, pedidoDeEstilo);
      }

      if (r.recado) {
        await this.whatsapp.enviarTexto(chat, r.recado);
        return;
      }
      if (r.foto.status !== 'EM_APROVACAO' || !r.foto.arquivoId) return;

      const tratada = await this.armazenamento.ler(r.foto.arquivoId);
      if (!tratada) return;

      // A CATRACA SOBE ANTES DO ENVIO. Se subisse depois e o envio falhasse
      // no meio, a foto ficaria EM_APROVACAO no banco sem ninguem escutando a
      // resposta; assim, no maximo, ela responde a uma imagem que nao chegou —
      // e a fila do banco, que e a verdade, corrige.
      this.sessao.marcarEmAprovacao(chat);

      await this.whatsapp.enviarImagem(
        chat,
        tratada.conteudo,
        tratada.mime,
        // A peca vai NOMEADA porque a fila pode ter varias: sem o codigo, um
        // "aprovo" solto seria um chute sobre qual imagem ela esta olhando.
        //
        // SEM CODIGO, A LEGENDA NAO PERGUNTA DE NOVO. O codigo ja foi pedido
        // quando a foto foi guardada; repetir a pergunta aqui abriria duas ao
        // mesmo tempo. Ela so avisa que o "aprovo" pode vir antes — o codigo
        // que chegar depois publica junto.
        r.foto.codigoErp
          ? `${r.foto.codigoErp} — ficou assim.\n` +
              '"aprovo" põe no catálogo · "ajusta" e o quê refaz · "descarta" joga fora.'
          : 'Ficou assim — ainda sem o código da peça.\n' +
              '"aprovo" e ela entra assim que o código chegar · "ajusta" e o quê refaz · "descarta" joga fora.',
      );

      this.sessao.marcarEnviada(chat, fotoId);
      enviada = true;
    } catch (err) {
      this.logger.error(
        `Falha ao tratar/avisar a foto ${fotoId}: ${String(err)}`,
      );
    } finally {
      if (!enviada) this.sessao.desistirDoEnvio(chat, fotoId);
    }
  }

  // ---------------------------------------------------------------------------
  // Chegou uma foto
  // ---------------------------------------------------------------------------
  async foto(msg: FotoDoCanal): Promise<RespostaFoto> {
    await this.varrerExpiradas();
    await this.rearmarAprovacao(msg.de, msg.nomeRemetente);

    const abertos = await this.catalogos.listarAbertos();
    if (abertos.length === 0) {
      return {
        resposta:
          'Recebi a foto, mas não há nenhum catálogo liberado para receber fotos. ' +
          'Crie ou libere um no painel e me manda de novo.',
        motivo: 'catalogo_nenhum_aberto',
      };
    }

    if (!msg.imagem.url) {
      // O WAHA reconheceu a imagem mas nao entregou o arquivo. Avisar e melhor
      // que silencio: quem mandou acha que deu certo.
      return {
        resposta:
          'Chegou sua foto mas não consegui baixar o arquivo. Pode mandar de novo?',
        motivo: 'imagem_sem_arquivo',
      };
    }

    const arquivo = await this.whatsapp.baixarMidia(msg.imagem.url);
    if (!arquivo) {
      return {
        resposta:
          'Chegou sua foto mas não consegui baixar o arquivo. Pode mandar de novo?',
        motivo: 'imagem_download_falhou',
      };
    }

    const mime = arquivo.mimetype.startsWith('image/')
      ? arquivo.mimetype
      : msg.imagem.mimetype;
    if (!MIMES_IMAGEM.includes(mime as (typeof MIMES_IMAGEM)[number])) {
      return {
        resposta: `Não consigo usar esse formato (${mime}). Manda como foto normal (JPEG ou PNG).`,
        motivo: 'imagem_formato_recusado',
      };
    }
    if (arquivo.conteudo.length > LIMITE_BYTES) {
      return {
        resposta: 'Essa imagem é grande demais. Manda uma versão menor.',
        motivo: 'imagem_grande_demais',
      };
    }

    // ------------------------------------------------------------------
    // A FOTO TEM UMA PECA? — 15/09/2026.
    //
    // O Lucas mandou a foto do canto de um notebook e recebeu de volta uma
    // FERRADURA de metal, bem iluminada, sobre fundo branco. Nao havia
    // ferradura nenhuma: `/images/edits` REGERA a imagem e so sabe devolver
    // imagem — sem peca na entrada, ele produz a peca mais provavel.
    //
    // ENTAO A RECUSA ACONTECE AQUI, ANTES DE GRAVAR E ANTES DE GERAR: um
    // modelo que OLHA a foto e responde em texto. Quando ele diz que nao ha
    // peca, a conversa pede outra foto — e a geracao, que e a chamada cara,
    // nem chega a sair.
    //
    // `null` = NAO DEU PARA CONFERIR (timeout, cota, chave ausente), e nao
    // "nao serve". Nesse caso a foto segue o caminho de sempre: uma
    // indisponibilidade do provedor nao pode fechar o canal do catalogo.
    // ------------------------------------------------------------------
    const veredito = await this.conferencia.conferir({
      conteudo: arquivo.conteudo,
      mime,
    });
    if (veredito && !veredito.serve) {
      return {
        resposta: this.pedirOutraFoto(veredito),
        motivo: `foto_recusada_${veredito.motivo}`,
      };
    }

    // GRAVA ANTES DE QUALQUER PERGUNTA — ver o cabecalho.
    const chave = await this.armazenamento.guardar(
      { conteudo: arquivo.conteudo, mime, nomeOriginal: 'whatsapp' },
      PASTA_PENDENTES,
    );

    const analise = await this.lerLegenda(msg.legenda, abertos);
    const catalogo = analise.catalogo ?? this.sessao.catalogoAtual(msg.de);

    // O CODIGO QUE CHEGOU ANTES DA FOTO — "CO26185" mandado sozinho, com a
    // conversa aberta. Vale so quando a legenda nao trouxe um: o que vem
    // escrito na propria foto e mais especifico que o que veio antes dela.
    const adiantado = analise.codigo
      ? null
      : this.sessao.retirarCodigoAdiantado(msg.de);
    const codigoErp = analise.codigo ?? adiantado?.codigoErp ?? null;
    const parcelas = analise.parcelas ?? adiantado?.parcelas ?? null;
    const juros = analise.juros ?? adiantado?.juros ?? null;

    if (!catalogo) {
      const pendurou = this.sessao.pendurar(msg.de, {
        arquivoId: chave,
        mime,
        codigoErp,
        parcelas,
        juros,
        pedidoDeEstilo: analise.pedidoDeEstilo,
      });
      if (!pendurou) {
        await this.armazenamento.remover(chave);
        return {
          resposta:
            'Tem foto demais esperando resposta. Me diz de qual catálogo são antes de mandar mais.',
          motivo: 'fila_cheia',
        };
      }
      // Quem nao responder vai ser AVISADO quando a foto expirar — ver
      // `varrerExpiradas`. O relogio comeca aqui.
      this.agendarVarredura();
      return {
        resposta: this.perguntarCatalogo(abertos),
        motivo: 'aguardando_catalogo',
      };
    }

    this.sessao.lembrarCatalogo(msg.de, catalogo);
    const guardada = await this.guardarFoto(
      catalogo,
      msg.nomeRemetente,
      {
        arquivoId: chave,
        mime,
        codigoErp,
        parcelas,
        juros,
        pedidoDeEstilo: analise.pedidoDeEstilo,
        em: Date.now(),
      },
      msg.de,
    );

    return { resposta: guardada, motivo: 'foto_guardada' };
  }

  // ---------------------------------------------------------------------------
  // Chegou um texto enquanto havia foto esperando
  // ---------------------------------------------------------------------------
  async resposta(
    de: string,
    nomeRemetente: string,
    texto: string,
  ): Promise<RespostaFoto> {
    const abertos = await this.catalogos.listarAbertos();
    const analise = await this.lerLegenda(texto, abertos);

    if (!analise.catalogo) {
      // O CODIGO ANTES DO CATALOGO. Perguntei o catalogo e veio o codigo da
      // peca: e resposta a outra pergunta, mas e informacao boa — e a ordem e
      // de quem fala (decisao do Lucas em 11/09). Anoto na foto que espera, e
      // pergunto so o que ainda falta.
      if (analise.codigo) {
        const completadas = this.sessao.completarPendentes(de, {
          codigoErp: analise.codigo,
          parcelas: analise.parcelas,
          juros: analise.juros,
        });
        if (completadas > 0) {
          return {
            resposta:
              `Anotei o código ${analise.codigo}. Falta só o catálogo — ` +
              this.perguntarCatalogo(abertos),
            motivo: 'codigo_antes_do_catalogo',
          };
        }
      }
      return {
        resposta: 'Não achei esse catálogo. ' + this.perguntarCatalogo(abertos),
        motivo: 'catalogo_nao_reconhecido',
      };
    }

    const catalogo = analise.catalogo;
    this.sessao.lembrarCatalogo(de, catalogo);

    const fila = this.sessao.recolherPendentes(de);
    if (fila.length === 0) {
      return {
        resposta: `Certo — as próximas fotos vão para o #${catalogo.numero} ${catalogo.nome}.`,
        motivo: 'catalogo_lembrado',
      };
    }

    const linhas: string[] = [];
    for (const pendente of fila) {
      // O codigo da legenda de agora vale para as fotos que vieram sem codigo.
      const comCodigo: FotoPendente = {
        ...pendente,
        codigoErp: pendente.codigoErp ?? analise.codigo,
        parcelas: pendente.parcelas ?? analise.parcelas,
        juros: pendente.juros ?? analise.juros,
      };
      linhas.push(
        await this.guardarFoto(catalogo, nomeRemetente, comCodigo, de),
      );
    }

    return {
      resposta:
        fila.length === 1
          ? linhas[0]
          : `${fila.length} fotos foram para o #${catalogo.numero} ${catalogo.nome}.`,
      motivo: 'fotos_classificadas',
    };
  }

  // ---------------------------------------------------------------------------
  // Chegou o codigo da peca, depois da foto
  // ---------------------------------------------------------------------------

  /**
   * O `BR26252` digitado depois de a foto ja estar guardada.
   *
   * ==========================================================================
   * ISTO EXISTE PORQUE A MENSAGEM ANTERIOR CONVIDA. Ao guardar uma foto sem
   * codigo, a confirmacao diz "me manda o codigo da peca que eu completo o
   * descritivo" — e ate 01/09/2026 ninguem escutava: o codigo caia nos
   * agentes e a Anastasia respondia "esse codigo nao me diz muito sozinho".
   *
   * Mesma regra de ontem, e vale repetir: nao crie uma pergunta que voce nao
   * sabe responder.
   * ==========================================================================
   *
   * Devolve `null` quando o texto NAO tem cara de codigo — ai era outra coisa,
   * e segue para os agentes.
   *
   * @param nomeRemetente quem aprova, se a aprovacao ja tiver vindo antes.
   */
  async codigo(
    de: string,
    texto: string,
    nomeRemetente = '',
  ): Promise<RespostaFoto | null> {
    const pendente = this.sessao.codigoPendente(de);
    if (!pendente) return null;

    const m = texto.match(RE_CODIGO);
    if (!m) return null;

    // O PARCELAMENTO TAMBEM VALE AQUI. `BR26252 6x` numa mensagem so tem de
    // funcionar igual a `0001 BR26252 6x` na legenda — quem escreve nao sabe
    // (nem deveria saber) que sao dois caminhos de codigo diferentes.
    return this.anotarCodigo(
      de,
      pendente,
      m[1].toUpperCase(),
      texto.replace(m[0], ' '),
      nomeRemetente,
    );
  }

  temCodigoEsperando(de: string): boolean {
    return this.sessao.codigoPendente(de) !== null;
  }

  // ---------------------------------------------------------------------------
  // Nao sei o codigo, sei a peca
  // ---------------------------------------------------------------------------

  /**
   * "anel de esmeralda ouro branco" no lugar de `CB384`.
   *
   * ==========================================================================
   * QUEM ESTA COM A PECA NA MAO NEM SEMPRE TEM O CODIGO A VISTA. Ate aqui a
   * unica resposta aceita ao "me manda o codigo" era o codigo em si —
   * qualquer descricao caia nos agentes, e a Anastasia nao sabe de que foto
   * se trata.
   *
   * A BUSCA E A MESMA DA ELENA, de 20/08. Nao existe uma segunda
   * implementacao do "procurar joia por texto" para divergir na primeira
   * correcao.
   *
   * SEMPRE CONFIRMA, mesmo com um resultado so. O proprio `ProdutosModule`
   * ja avisa: a busca textual serve para gente, nao para casar uma chave — e
   * aqui errar a peca significa publicar o preco de outra. Anotar sozinho
   * economizaria uma mensagem e arriscaria um numero errado impresso na
   * pagina, que ninguem confere depois.
   * ==========================================================================
   *
   * DEVOLVE `null` quando o texto nao era busca nem escolha — mesmo contrato
   * de `codigo` e `aprovacao` com o roteador: segue para os agentes.
   *
   * A ORDEM NO ROTEADOR IMPORTA, e este metodo depende dela: vem DEPOIS de
   * `aprovacao`, entao um `aprovo` com foto tratada esperando veredito nunca
   * chega aqui como termo de busca.
   */
  async buscarPeca(
    de: string,
    texto: string,
    nomeRemetente = '',
  ): Promise<RespostaFoto | null> {
    const pendente = this.sessao.codigoPendente(de);
    if (!pendente) return null;

    const limpo = normalizar(texto);
    const opcoes = this.sessao.escolhaPendente(de);

    if (opcoes) {
      // `2 6x` tambem vale: o que sobra depois do numero segue para a leitura
      // de parcelamento, igual ao codigo digitado.
      const escolha = limpo.match(RE_ESCOLHA);
      if (escolha) {
        const i = Number(escolha[1]);
        if (i >= 1 && i <= opcoes.length) {
          return this.anotarCodigo(
            de,
            pendente,
            opcoes[i - 1].codigo,
            limpo.slice(escolha[0].length),
            nomeRemetente,
          );
        }

        // FORA DA LISTA MERECE RESPOSTA. Com a lista na tela, numero solto e
        // tentativa de escolha; o silencio deixaria a pessoa achando que
        // respondeu.
        return {
          resposta:
            `Essa lista tem ${opcoes.length} — me responde com um número de 1 a ` +
            `${opcoes.length}, ou manda o código da peça.`,
          motivo: 'escolha_fora_da_lista',
        };
      }

      if (opcoes.length === 1 && PALAVRAS_CONFIRMA.includes(limpo)) {
        return this.anotarCodigo(
          de,
          pendente,
          opcoes[0].codigo,
          '',
          nomeRemetente,
        );
      }
    }

    if (!RE_TIPO_PECA.test(limpo)) return null;

    // A BUSCA VAI COM O TEXTO CRU, e nao com o normalizado: o `normalizar`
    // tira acento, e `alianca` nao casa com `ALIANÇA` no ILIKE do Postgres.
    // O normalizado decide SE e busca; o cru e o que se procura.
    const achadas = await this.procurar(texto.trim());
    if (achadas.length === 0) {
      return {
        resposta:
          `Não achei nenhuma peça com "${texto.trim()}". Tenta com outras ` +
          'palavras — ou me manda o código dela.',
        motivo: 'busca_sem_resultado',
      };
    }

    this.sessao.oferecerEscolha(de, achadas);
    return { resposta: this.listarOpcoes(achadas), motivo: 'busca_com_opcoes' };
  }

  // ---------------------------------------------------------------------------
  // Chegou um texto enquanto havia foto esperando o "aprovo"
  // ---------------------------------------------------------------------------

  /**
   * A resposta ao "ficou assim?".
   *
   * ==========================================================================
   * DEVOLVE `null` QUANDO O TEXTO NAO ERA RESPOSTA DE APROVACAO — e esse null
   * e o contrato com o roteador: significa "nao era comigo, segue para os
   * agentes". Um "quanto vendi hoje?" digitado com foto pendurada tem de
   * chegar na Anastasia como chegaria em qualquer outro momento.
   * ==========================================================================
   *
   * QUEM APROVA E QUEM FOTOGRAFOU. A fila vem filtrada por `remetente`, que e
   * o nome do staff resolvido NO SERVIDOR a partir do telefone — nunca algo
   * que veio escrito na mensagem. Nao ha caminho de codigo para aprovar a foto
   * de outra pessoa.
   *
   * QUAL FOTO: a mais antiga da fila, que e a que ela viu primeiro. "aprovo
   * todas" pega a fila inteira — o caso real de quem fotografa 20 pecas e so
   * confere no fim.
   *
   * @param nomeRemetente rotulo do staff, resolvido pelo telefone.
   * @param escritaEm quando a mensagem foi ESCRITA, pelo carimbo do WhatsApp.
   *   Sem ele, a hora de agora — que so erra para o lado de aceitar.
   */
  async aprovacao(
    de: string,
    nomeRemetente: string,
    texto: string,
    escritaEm: number = Date.now(),
  ): Promise<RespostaFoto | null> {
    const fila = await this.catalogos.listarEmAprovacao(nomeRemetente.trim());
    if (fila.length === 0) {
      // A catraca estava levantada e o banco discorda: ou a tela ja aprovou,
      // ou o tratamento nem chegou a EM_APROVACAO. O banco manda.
      this.sessao.esquecerAprovacao(de);
      return null;
    }

    const veredito = lerVeredito(texto);

    // ==========================================================================
    // O RELOGIO: SO CONTA A FOTO QUE A PESSOA JA TINHA VISTO QUANDO ESCREVEU.
    //
    // Decisao do Lucas em 11/09/2026: toda palavra de afirmacao aprova — "ok",
    // "sim", "gostei", o joinha. O risco que isso abre esta no print do Yerlon:
    // o "Ok" das 13:33 era resposta a "codigo anotado", e a foto tratada chegou
    // as 13:34. Chegando alguns segundos antes, aquele "Ok" teria publicado uma
    // foto que ele nao viu.
    //
    // A protecao deixou de ser a palavra e passou a ser a ORDEM NO TEMPO.
    // Afirmacao escrita antes de a foto sair nao e sobre ela.
    // ==========================================================================
    const vistas = fila.filter((f) =>
      this.sessao.foiVista(de, f.id, escritaEm),
    );

    // EU ACABEI DE PERGUNTAR O QUE MUDAR — então isto é a resposta, e não
    // precisa da palavra de comando. Vale só quando o texto não é, por si, um
    // veredito: um "aprovo" logo depois da pergunta continua sendo aprovação,
    // e não pedido de estilo.
    if (veredito.tipo === 'NENHUM' && this.sessao.eraRespostaDeAjuste(de)) {
      const alvo = fila[0];
      void this.tratarEAvisar(alvo.id, texto.trim(), de);
      return {
        resposta: `Refazendo ${this.rotulo(alvo)}. Te mando em instantes.`,
        motivo: 'foto_em_ajuste',
      };
    }

    if (veredito.tipo === 'NENHUM') {
      // ========================================================================
      // A DICA, UMA VEZ SO. Ate 11/09 tudo que nao estava na lista caia na
      // Anastasia, que nao sabe que ha foto esperando — e respondia "Aprovar o
      // quê?". Resposta curta, logo depois de a foto chegar, quase sempre e
      // sobre ela; entao eu digo como responder.
      //
      // Mas SO UMA VEZ por foto, e so para resposta curta e sem "?": a
      // segunda frase que eu nao entender vai para os agentes, como sempre
      // foi. E o vocabulario fechado continua protegendo o "quanto vendi
      // hoje?" — ele tem ponto de interrogacao.
      // ========================================================================
      // A DESCRIÇÃO DA PEÇA NÃO É RESPOSTA DE APROVAÇÃO — 16/09/2026.
      //
      // Com a foto esperando código, eu mesmo pedi "descreve ela ('anel de
      // esmeralda')". A resposta "Anel de esmeralda" é curta e sem "?", e caía
      // aqui na dica "não entendi se é sobre a foto" — que, dada uma vez, só
      // deixava a SEGUNDA tentativa chegar na busca. Devolver `null` deixa o
      // roteador seguir para `buscarPeca`, que é quem responde isso.
      //
      // E A RESPOSTA À LISTA TAMBÉM NÃO É: no mesmo teste, "colar de
      // esmeralda" trouxe as 6 opções e o "2" levou a dica. Com a lista na
      // tela, qualquer texto é assunto da escolha — inclusive o número fora
      // dela, que `buscarPeca` responde.
      if (
        this.sessao.codigoPendente(de) &&
        (this.sessao.escolhaPendente(de) ||
          RE_TIPO_PECA.test(normalizar(texto)))
      ) {
        return null;
      }

      const alvo = vistas[0];
      if (alvo && ehRespostaCurta(texto) && this.sessao.darDica(de, alvo.id)) {
        return {
          resposta:
            `Não entendi se é sobre ${this.rotulo(alvo)}. Responde "aprovo" ` +
            'que ela entra no catálogo, "ajusta" e o que mudar, ou "descarta".',
          motivo: 'aprovacao_dica',
        };
      }
      return null;
    }

    if (veredito.tipo === 'DESCARTA') {
      const alvos = veredito.todas ? fila : [fila[0]];
      for (const foto of alvos) await this.jogarFora(foto);

      const restantes = fila.slice(alvos.length);
      if (restantes.length === 0) this.sessao.esquecerAprovacao(de);

      const cabeca =
        alvos.length === 1
          ? `Descartei ${this.rotulo(alvos[0])}.`
          : `Descartei ${alvos.length} fotos.`;

      return {
        resposta: `${cabeca}${this.eSobraram(restantes)}`,
        motivo: 'foto_descartada',
      };
    }

    if (veredito.tipo === 'AJUSTA') {
      if (!veredito.pedido) {
        // Sem instrucao, gerar de novo so queimaria uma das tres tentativas
        // para produzir outra imagem igualmente sem rumo. Pergunto — e marco
        // que a proxima mensagem e a resposta, senao ela cairia nos agentes.
        this.sessao.pedirOAjuste(de);
        return {
          resposta:
            'O que você quer que eu mude? Me diz — "mais claro", "fundo branco" — que eu refaço.',
          motivo: 'ajuste_sem_pedido',
        };
      }

      const alvo = fila[0];
      // Mesma razao de sempre: gerar leva 10 a 30 segundos e o webhook nao
      // pode esperar. Ela recebe o "refazendo" agora e a imagem quando ficar.
      void this.tratarEAvisar(alvo.id, veredito.pedido, de);
      return {
        resposta: `Refazendo ${this.rotulo(alvo)}. Te mando em instantes.`,
        motivo: 'foto_em_ajuste',
      };
    }

    // "SIM" COM A LISTA DE UMA PECA SO NA TELA RESPONDE A LISTA. A ultima
    // pergunta que eu fiz foi "É ela?", e uma pergunta por vez: o "sim" e
    // dela. Segue para `buscarPeca`, que anota o codigo — e, se a aprovacao
    // ja tinha vindo antes, publica junto.
    const opcoes = this.sessao.escolhaPendente(de);
    if (opcoes?.length === 1 && PALAVRAS_CONFIRMA.includes(normalizar(texto))) {
      return null;
    }

    // Nenhuma foto vista quando a pessoa escreveu: a afirmacao era sobre outra
    // coisa — o "Ok" a "codigo anotado". E RECIBO, e recibo nao pede resposta:
    // nem aprovacao, nem a Anastasia perguntando "Como posso te ajudar?".
    if (vistas.length === 0) {
      return { resposta: null, motivo: 'recibo_antes_da_foto' };
    }

    const alvos = veredito.todas ? vistas : [vistas[0]];

    // ==========================================================================
    // SEM CÓDIGO NÃO ENTRA NO CATÁLOGO.
    //
    // Em 01/09/2026 uma foto sem código foi aprovada e apareceu na tela com
    // `—` no lugar do descritivo. Um catálogo é peça, código e preço: sem eles
    // a página sai com um espaço em branco onde deveria estar a venda, e o PDF
    // montado imprime isso.
    //
    // Barrar aqui e não na montagem é deliberado: aqui a pessoa está com a
    // peça na mão e o código à vista. Na montagem, dias depois, ninguém sabe
    // mais de qual peça era aquela foto.
    // ==========================================================================
    //
    // A APROVAÇÃO FICA GUARDADA, e isto é de 11/09/2026. Até aqui a pessoa
    // ouvia "falta o código", mandava o código, e tinha de dizer "aprovo" DE
    // NOVO — três mensagens para uma intenção. Agora a marca vai junto da foto
    // que espera o código, e o código que chegar anota e publica de uma vez.
    // A regra de cima continua de pé: a foto só entra COM código.
    // ==========================================================================
    const semCodigo = alvos.filter((f) => !f.codigoErp);
    if (semCodigo.length > 0) {
      // Marca a primeira, para o código que vier em seguida encontrá-la.
      //
      // O RÓTULO É O DO CATÁLOGO, e não "essa foto" — 16/09/2026. A
      // confirmação do código abre com ele ("#0004 Holiday", e a peça embaixo);
      // com o texto fixo a mensagem saiu começando por um "essa foto" solto.
      // Se a foto já esperava código, o rótulo que ela tinha continua valendo.
      const primeira = semCodigo[0];
      const jaEsperava = this.sessao.codigoPendente(de);
      let rotulo = jaEsperava?.fotoId === primeira.id ? jaEsperava.alvo : null;
      if (!rotulo) {
        const catalogo = await this.catalogos.buscarPorId(primeira.catalogoId);
        rotulo = catalogo ? `#${catalogo.numero} ${catalogo.nome}` : 'o catálogo';
      }
      this.sessao.esperarCodigo(
        de,
        primeira.id,
        rotulo,
        semCodigo.length === 1 && alvos.length === 1,
      );
      return {
        resposta:
          semCodigo.length === 1 && alvos.length === 1
            ? 'Anotado — ela entra no catálogo assim que tiver o código. Me manda o código da peça, ou descreve ela ("anel de esmeralda") que eu procuro.'
            : `${semCodigo.length} dessas fotos estão sem código. Me manda o código de cada uma antes de aprovar.`,
        motivo: 'aprovacao_sem_codigo',
      };
    }

    for (const foto of alvos) {
      await this.catalogos.atualizarFoto(foto.id, {
        status: 'APROVADA',
        aprovadoPor: nomeRemetente,
        aprovadoEm: new Date(),
      });
    }

    const aprovadas = new Set(alvos.map((f) => f.id));
    const restantes = fila.filter((f) => !aprovadas.has(f.id));
    if (restantes.length === 0) this.sessao.esquecerAprovacao(de);

    return {
      resposta: this.confirmarAprovacao(alvos, restantes),
      motivo: 'foto_aprovada',
    };
  }

  temFotoEsperando(de: string): boolean {
    return this.sessao.temPendentes(de);
  }

  /**
   * Vale a pena tratar o proximo texto deste remetente como resposta de
   * aprovacao? E so a catraca de memoria — quem confere de verdade e
   * `aprovacao`, contra o banco.
   */
  temFotoEmAprovacao(de: string): boolean {
    return this.sessao.temEmAprovacao(de);
  }

  /**
   * "Tem foto em aberto?" — a pergunta, respondida pelo banco.
   *
   * Diferente do lembrete em UMA coisa: aqui a pessoa PERGUNTOU, entao "nao
   * tem nada" e uma resposta legitima. No lembrete, silencio — o chao do
   * canal segue e ela recebe o menu.
   */
  async fotosPendentes(de: string, nomeRemetente: string): Promise<RespostaFoto> {
    const r = await this.pendentes(de, nomeRemetente);
    return (
      r ?? {
        resposta:
          'Não tem nenhuma foto sua esperando resposta agora. ' +
          'Me manda a foto da peça que eu trato e te devolvo.',
        motivo: 'catalogo_sem_pendentes',
      }
    );
  }

  /**
   * O LEMBRETE DA FOTO PENDURADA — 21/09/2026.
   *
   * ==========================================================================
   * COM FOTO ESPERANDO, TEXTO SOLTO E QUASE SEMPRE UMA TENTATIVA DE RESPONDER.
   *
   * O Lucas escreveu "Ajuda traz o fundo branco como sempre" logo depois de
   * receber a foto tratada. Ele quis dizer "ajusta" — e "ajuda", com D, nao
   * esta em `PALAVRAS_AJUSTA` nem pode estar: "ajuda" e o pedido de socorro
   * que abre o menu, e aceita-la aqui faria um pedido de ajuda virar uma
   * geracao de imagem paga.
   *
   * O ERRO NAO FOI NAO ADIVINHAR, FOI NAO LEMBRAR. A resposta caiu no chao do
   * canal e virou menu — um menu que nem menciona que existe foto esperando.
   * Com o lembrete, a proxima mensagem dele ja sai certa.
   *
   * NAO ADIVINHA NADA. Nao tenta corrigir a palavra, nao escolhe veredito, nao
   * gera imagem: so diz o que esta pendurado e quais sao as tres palavras.
   * ==========================================================================
   *
   * `null` quando nao ha nada esperando — ai o chao do canal segue normal.
   */
  async lembreteDaAprovacao(
    de: string,
    nomeRemetente: string,
  ): Promise<RespostaFoto | null> {
    return this.pendentes(de, nomeRemetente);
  }

  /**
   * O que esta pendurado: o texto, e as FOTOS de volta.
   *
   * ==========================================================================
   * O CODIGO SOZINHO NAO DIZ QUAL PECA E — 21/09/2026.
   *
   * O lembrete dizia "AN24361 esperando sua resposta" e o Lucas perguntou,
   * com razao: "como vou saber qual e?". Ninguem decora codigo, e a decisao
   * pedida — aprovar, ajustar ou descartar — e sobre a IMAGEM.
   *
   * ENTAO AS FOTOS VOLTAM. E o relogio da aprovacao volta com elas
   * (`marcarEnviada`): a partir de agora o "aprovo" responde a esta imagem,
   * que e a que ela acabou de ver.
   *
   * AS IMAGENS VAO ATRAS DO TEXTO, sem `await` — o texto e o retorno, e quem
   * o envia e a borda HTTP. Segurar o webhook pelo tempo de ler cinco
   * arquivos do S3 faria o WAHA reenviar o evento.
   * ==========================================================================
   */
  private async pendentes(
    de: string,
    nomeRemetente: string,
  ): Promise<RespostaFoto | null> {
    const esperando = await this.catalogos.listarEmAprovacao(
      nomeRemetente.trim(),
    );
    if (esperando.length === 0) return null;

    // A catraca sobe junto, como na `conversa`: depois de um restart a marca
    // de memoria some, e sem ela o "aprovo" seguinte nao seria reconhecido.
    this.sessao.marcarEmAprovacao(de);

    const volta = esperando.filter((f) => f.arquivoId).slice(0, MAX_REENVIO);
    if (volta.length > 0) void this.reenviar(de, volta);

    const nomes = esperando.map((f) => f.codigoErp ?? 'sem código').join(', ');
    const sobraram = esperando.length - volta.length;
    const linhas = [
      esperando.length === 1
        ? `Tem 1 foto esperando sua resposta: ${nomes}.`
        : `Tem ${esperando.length} fotos esperando sua resposta: ${nomes}.`,
    ];
    if (volta.length > 0) {
      linhas.push(
        volta.length === 1
          ? 'Mando ela aqui embaixo.'
          : `Mando ${volta.length} aqui embaixo.` +
              (sobraram > 0
                ? ` As outras ${sobraram} eu mando depois que você resolver essas.`
                : ''),
      );
    }
    linhas.push(
      '"aprovo" põe no catálogo · "ajusta" e o quê refaz — ' +
        '"ajusta fundo branco" · "descarta" joga fora.',
    );

    return {
      resposta: linhas.join('\n\n'),
      motivo: 'catalogo_pendentes',
    };
  }

  /**
   * As fotos penduradas, de volta ao WhatsApp.
   *
   * CADA UMA NOMEADA: a fila pode ter varias, e sem o codigo na legenda um
   * "aprovo" solto seria um chute sobre qual imagem a pessoa esta olhando.
   *
   * Falha de envio nao derruba nada — a fila de verdade esta no banco, e a
   * proxima pergunta traz tudo de novo.
   */
  private async reenviar(de: string, fotos: FotoItem[]): Promise<void> {
    for (const foto of fotos) {
      try {
        const arquivo = await this.armazenamento.ler(foto.arquivoId!);
        if (!arquivo) continue;
        await this.whatsapp.enviarImagem(
          de,
          arquivo.conteudo,
          arquivo.mime,
          `${foto.codigoErp ?? 'Sem código'} — esperando sua resposta.`,
        );
        // O RELOGIO REINICIA AQUI: o "aprovo" que vier depois responde a esta
        // imagem. Ver `foiVista`.
        this.sessao.marcarEnviada(de, foto.id);
      } catch (err) {
        this.logger.error(
          `Falha ao reenviar a foto ${foto.id}: ${String(err)}`,
        );
      }
    }
  }

  /** A IA falhou numa foto desta pessoa, e o "tenta de novo" ainda vale? */
  temFotoComFalha(de: string): boolean {
    return this.sessao.fotoComFalha(de) !== null;
  }

  /**
   * "tenta de novo" — refaz a foto que a IA nao tratou. 16/09/2026.
   *
   * A MESMA FOTO, A PARTIR DO ORIGINAL: nada de a pessoa mandar outra e a
   * primeira ficar abandonada no banco e no bucket. O pedido de estilo que
   * veio com ela vai junto.
   *
   * CONFERE O BANCO ANTES: a lembranca e da memoria, e a foto pode ter sido
   * descartada ou tratada por outro caminho no meio. So refaz o que ainda esta
   * RECEBIDA. Devolve `null` quando o texto nao e o comando — segue o fluxo.
   */
  async tentarDeNovo(de: string, texto: string): Promise<RespostaFoto | null> {
    const falha = this.sessao.fotoComFalha(de);
    if (!falha || !RE_TENTA_DE_NOVO.test(normalizar(texto))) return null;

    this.sessao.esquecerFalha(de);
    const foto = await this.catalogos.buscarFotoPorId(falha.fotoId);
    if (!foto || foto.status !== 'RECEBIDA') {
      return {
        resposta: 'Essa foto já não está esperando — manda de novo se ainda precisar.',
        motivo: 'refazer_sem_foto',
      };
    }

    void this.tratarEAvisar(foto.id, falha.pedido, de);
    return {
      resposta: 'Tentando de novo — te mando em instantes.',
      motivo: 'foto_refazendo',
    };
  }

  /**
   * A resposta de quando a foto nao serve.
   *
   * DIZ O QUE FOI VISTO, quando o modelo soube dizer: "parece um teclado de
   * notebook" explica a recusa melhor que qualquer frase generica, e evita o
   * reenvio da mesma foto. Sem isso, a pessoa manda de novo e recebe a mesma
   * recusa, sem entender.
   *
   * E PEDE O QUE FALTA, sempre: quem le quer saber o que fazer agora.
   */
  private pedirOutraFoto(veredito: VereditoFoto): string {
    if (veredito.motivo === 'varias_pecas') {
      return (
        'Vi mais de uma peça nessa foto e não sei qual é a da vez. ' +
        'Manda uma foto de cada peça, separadas.'
      );
    }

    const viu = veredito.viu?.trim();
    return (
      (viu
        ? `Não achei nenhuma peça nessa foto — o que eu vi foi ${viu}. `
        : 'Não consegui identificar a peça nessa foto. ') +
      'Manda de novo com a peça inteira no quadro, de frente e com boa luz.'
    );
  }

  // ---------------------------------------------------------------------------
  // Consultar uma peca — a opcao 2 do menu, desde 15/09/2026
  // ---------------------------------------------------------------------------

  /**
   * "Consultar uma peça" escolhida no menu: pergunto qual e espero.
   *
   * NAO ABRE CONVERSA DE CATALOGO. Quem quer ver o preco de uma peca nao esta
   * mandando foto, e abrir a conversa faria o `#0003` seguinte virar escolha
   * de catalogo em vez de busca.
   */
  pedirConsulta(de: string): RespostaFoto {
    this.sessao.esperarConsulta(de);
    return {
      resposta:
        'Me manda o código da peça — ou o nome dela, se não tiver o código.',
      motivo: 'catalogo_consulta_pedida',
    };
  }

  /** Estou esperando a peca de uma consulta deste remetente? */
  esperandoConsulta(de: string): boolean {
    return this.sessao.consultaPendente(de);
  }

  /**
   * A peca pedida na consulta: descricao, preco e saldo.
   *
   * ==========================================================================
   * SO LE. Esta e a diferenca para o `buscarPeca`, que parece fazer o mesmo:
   * la a escolha ENTRA numa foto guardada — aqui nada e escrito, e por isso a
   * resposta pode sair com a lista inteira, sem pedir confirmacao de qual e.
   *
   * O SALDO VAI JUNTO porque quem pergunta e estoque e marketing: "tem?" e a
   * outra metade de "quanto custa?".
   * ==========================================================================
   *
   * RESPONDIDA, A ESPERA ACABA: a frase seguinte volta a ser do canal de
   * sempre. Sem isso, um "obrigado" depois da consulta viraria termo de busca.
   *
   * SEM RESULTADO, A ESPERA CONTINUA. A resposta pede outra tentativa — "tenta
   * com outras palavras" —, entao a proxima mensagem TEM de ser reconhecida
   * como a tentativa. Ate 16/09/2026 a espera era apagada antes da busca nos
   * dois casos: o Lucas pediu a consulta, errou o nome, mandou outro e recebeu
   * a lista de catalogos. Nao crie uma pergunta que voce nao sabe responder.
   * Nao vira laco: a espera tem validade propria (`JANELA_MS`).
   *
   * DEVOLVE `null` quando ninguem pediu consulta — mesmo contrato de
   * `codigo`, `aprovacao` e `buscarPeca` com o roteador.
   */
  async consulta(de: string, texto: string): Promise<RespostaFoto | null> {
    if (!this.sessao.consultaPendente(de)) return null;
    this.sessao.esquecerConsulta(de);

    const codigo = texto.match(RE_CODIGO)?.[1]?.toUpperCase();

    if (codigo) {
      const produto = await this.produtos.findByCodigoErp(codigo);
      if (!produto) {
        // Pedi outra tentativa: a proxima mensagem tem de ser reconhecida.
        this.sessao.esperarConsulta(de);
        return {
          resposta:
            `Não achei a peça ${codigo} no catálogo. Confere o código — ou ` +
            'me manda o nome dela que eu procuro.',
          motivo: 'consulta_sem_resultado',
        };
      }
      return {
        resposta: this.fichaDaPeca(
          codigo,
          produto.descricaoEtiqueta ??
            `${produto.familia} ${produto.categoria}`.trim(),
          produto.valorVenda,
          produto.estoqueAtual,
        ),
        motivo: 'consulta_por_codigo',
      };
    }

    // "Consultar peça", "quero ver o preço": pedido sem a peca. Pergunto qual
    // — e `pedirConsulta` rearma a espera.
    const termo = termoDaConsulta(texto);
    if (!termo) return this.pedirConsulta(de);

    const achadas = await this.procurar(termo);
    if (achadas.length === 0) {
      // Pedi outra tentativa: a proxima mensagem tem de ser reconhecida.
      this.sessao.esperarConsulta(de);
      return {
        resposta:
          `Não achei nenhuma peça com "${termo}". Tenta com outras palavras — ` +
          'ou me manda o código dela.',
        motivo: 'consulta_sem_resultado',
      };
    }

    const linhas = achadas.map(
      (o) =>
        `${o.codigo} · ${o.descricao.toUpperCase()} · ${this.emReais(o.preco)}`,
    );
    return {
      resposta: [
        achadas.length === 1 ? 'Achei esta:' : `Achei ${achadas.length}:`,
        linhas.join('\n'),
      ].join('\n'),
      motivo: 'consulta_por_descricao',
    };
  }

  /** A peca em uma linha e meia, do jeito que ela chega no WhatsApp. */
  private fichaDaPeca(
    codigo: string,
    descricao: string,
    preco: number | null,
    estoque: number,
  ): string {
    const saldo =
      estoque > 0
        ? `${estoque} em estoque`
        : 'sem saldo em estoque — confere no sistema';
    return `${codigo} · ${descricao.toUpperCase()}\n${this.emReais(preco)} · ${saldo}`;
  }

  // ---------------------------------------------------------------------------
  // Em qualquer ordem — decisao do Lucas em 11/09/2026
  // ---------------------------------------------------------------------------

  /** Ha conversa de catalogo aberta com este remetente? So memoria, sem banco. */
  conversaAberta(de: string): boolean {
    return this.sessao.conversaAberta(de);
  }

  /**
   * O texto diz que a pessoa quer mandar foto? Ver `RE_FALA_FOTO`. So memoria:
   * o roteador pergunta isto antes de decidir se paga uma consulta ao banco.
   */
  falaDeMandarFoto(texto: string): boolean {
    const n = normalizar(texto);
    return (
      RE_FALA_FOTO.test(n) &&
      (RE_FALA_CATALOGO.test(n) || RE_FALA_ENVIO.test(n))
    );
  }

  /**
   * O texto pede uma consulta de peca? Ver `RE_FALA_CONSULTA`. So memoria.
   *
   * Tres sinais, qualquer um basta: um verbo de consulta ("consultar",
   * "quanto custa"), o nome de um tipo de peca ("anel de diamante", "peça") ou
   * um codigo ("BR26252").
   *
   * FOTO VENCE. "Vou mandar a foto da peça" fala de peca, mas e o outro
   * caminho — por isso o roteador pergunta `falaDeMandarFoto` antes, e esta
   * funcao tambem recusa quando o texto fala de foto.
   */
  falaDeConsultar(texto: string): boolean {
    const n = normalizar(texto);
    if (RE_FALA_FOTO.test(n)) return false;
    return (
      RE_FALA_CONSULTA.test(n) || RE_TIPO_PECA.test(n) || RE_CODIGO.test(texto)
    );
  }

  /**
   * O texto pergunta pelos CATALOGOS — 21/09/2026.
   *
   * ==========================================================================
   * ESTE TESTE NASCEU DE UMA RESPOSTA ERRADA, E O ERRO ERA O CHAO.
   *
   * Ate hoje a lista de catalogos era o CHAO do canal: qualquer texto que as
   * regras nao soubessem tratar caia nela. O Lucas, como estoquista,
   * perguntou "qual minha carteira?" e recebeu os quatro catalogos abertos —
   * uma resposta certa para uma pergunta que ninguem fez.
   *
   * Com este teste, a lista passa a ser a resposta de QUEM PERGUNTOU por ela.
   * O resto vai para o menu, que e onde mora "o que da para me pedir".
   * ==========================================================================
   */
  /**
   * O texto PERGUNTA pelo que esta esperando resposta — 21/09/2026.
   *
   * Pedido do Lucas: "nao posso pedir para ver as fotos que estao abertas?".
   * Nao podia — "tem foto em aberto?" caia no chao do canal e virava menu,
   * porque o lembrete so existia quando a memoria sabia que havia algo. E a
   * memoria some no restart do container, que e justamente quando a pessoa
   * mais precisa perguntar.
   *
   * AGORA E PERGUNTA, e a resposta sai do BANCO — a verdade, e nao o atalho.
   *
   * O VERBO DE ENVIO TEM A ULTIMA PALAVRA, e e ele que separa as duas
   * intencoes que usam as mesmas palavras:
   *
   *   "tem foto para aprovar?"            -> pergunta (nenhum verbo de envio)
   *   "quero mandar foto para aprovar"    -> envio    ("mandar")
   *
   * Sem essa regra eu teria de escolher entre atender uma frase ou a outra —
   * e a primeira versao escolheu errado, tirando "aprovar" da lista.
   *
   * VEM ANTES DE `falaDeMandarFoto` no roteador: "tem foto em aberto no
   * catalogo?" fala de foto e de catalogo, e sem esta ordem viraria envio.
   */
  falaDeFotosPendentes(texto: string): boolean {
    const n = normalizar(texto);
    if (RE_FALA_ENVIO.test(n)) return false;
    return RE_FALA_FOTO_OU_PECA.test(n) && RE_FALA_PENDENTE.test(n);
  }

  falaDeCatalogos(texto: string): boolean {
    const n = normalizar(texto);
    // Foto e consulta vem ANTES no roteador; aqui a ordem so evita que
    // "manda a foto para o catalogo 3" caia na lista em vez do envio.
    if (RE_FALA_FOTO.test(n)) return false;
    return RE_FALA_CATALOGO.test(n);
  }

  /**
   * A consulta aberta pelo TEXTO, sem ter passado pelo menu.
   *
   * "Consultar peça" pergunta qual; "quanto custa o anel de diamante?" ja
   * procura. Mesmo caminho de `consulta` — a espera e armada aqui so para
   * atravessar a porta dela, e as regras de rearmar e acabar valem iguais.
   */
  async consultarAgora(de: string, texto: string): Promise<RespostaFoto> {
    this.sessao.esperarConsulta(de);
    // Com a espera armada, `consulta` nunca devolve null.
    return (await this.consulta(de, texto)) as RespostaFoto;
  }

  /**
   * "Quero adicionar fotos ao catálogo #0001" — a conversa aberta pela
   * INTENCAO, antes da foto.
   *
   * ==========================================================================
   * O CASO DO YERLON, 10/09/2026, 16:42. Ele disse o que queria e qual
   * catalogo; a frase foi para a Anastasia, que respondeu que catalogo "fica
   * fora do meu alcance"; e a foto que ele mandou em seguida perguntou "De qual
   * catálogo é?" — o que ele tinha acabado de dizer.
   *
   * Agora o que foi dito fica: o catalogo e lembrado para a proxima foto, e o
   * codigo, se vier, tambem. A resposta pede so o que falta.
   * ==========================================================================
   */
  async intencao(de: string, texto: string): Promise<RespostaFoto> {
    const abertos = await this.catalogos.listarAbertos();
    if (abertos.length === 0) {
      return {
        resposta:
          'Não há nenhum catálogo liberado para receber fotos agora. ' +
          'Crie ou libere um no painel e me chama de novo.',
        motivo: 'catalogo_nenhum_aberto',
      };
    }

    this.sessao.abrirConversa(de);
    const analise = await this.lerLegenda(texto, abertos);

    if (analise.codigo) {
      this.sessao.adiantarCodigo(de, {
        codigoErp: analise.codigo,
        parcelas: analise.parcelas,
        juros: analise.juros,
      });
    }
    const doCodigo = analise.codigo
      ? ` O código ${analise.codigo} vale para a primeira.`
      : ' Se souber o código da peça, põe na legenda.';

    if (analise.catalogo) {
      this.sessao.lembrarCatalogo(de, analise.catalogo);
      return {
        resposta: `Pode mandar — as fotos vão para o #${analise.catalogo.numero} ${analise.catalogo.nome}.${doCodigo}`,
        motivo: 'catalogo_intencao',
      };
    }

    // O catalogo da ultima vez, se a conversa ainda estiver no prazo: quem
    // fotografa 20 pecas de uma colecao nao repete o numero a cada uma.
    const lembrado = this.sessao.catalogoAtual(de);
    if (lembrado) {
      return {
        resposta:
          `Pode mandar — as fotos vão para o #${lembrado.numero} ${lembrado.nome}, ` +
          `o último que você usou. Se for outro, me diz o número.${doCodigo}`,
        motivo: 'catalogo_intencao',
      };
    }

    return {
      resposta: `Pode mandar. ${this.perguntarCatalogo(abertos)}`,
      motivo: 'catalogo_intencao',
    };
  }

  /**
   * O que chega com a conversa aberta e nada pendente: o recibo, o catalogo
   * ou o codigo mandados ANTES da foto.
   *
   * ==========================================================================
   * E A ULTIMA COISA QUE O ROTEADOR TENTA, e so age sobre texto que e INTEIRO
   * do catalogo:
   *
   *   "Ok", "blz", 👍   -> recibo, e recibo nao pede resposta
   *   "#0003"           -> catalogo lembrado para a proxima foto
   *   "CO26185 6x"      -> codigo guardado para a proxima foto
   *
   * O resto devolve `null` e segue para os agentes. "vendas da loja 2" tem o
   * `2` de um catalogo, mas nao e SO isso — e continua sendo da Anastasia.
   * ==========================================================================
   */
  async continuarConversa(
    de: string,
    texto: string,
  ): Promise<RespostaFoto | null> {
    if (!this.sessao.conversaAberta(de)) return null;

    // O RECIBO. Em 10/09 o "Ok" do Yerlon a "codigo anotado" caiu na
    // Anastasia, que respondeu "Oi, Yerlon! Como posso te ajudar?".
    if (lerVeredito(texto).tipo === 'APROVA') {
      return { resposta: null, motivo: 'catalogo_recibo' };
    }

    const abertos = await this.catalogos.listarAbertos();

    // NUMERO SOZINHO E CATALOGO, NUNCA CODIGO. A base tem codigos de um
    // caractere (`1`, `2`), e pela leitura da legenda o `2` viraria codigo de
    // peca — quando quem manda so um numero, com a lista de catalogos na
    // tela, esta respondendo a lista.
    const numero = texto.trim().match(/^#?(\d{1,6})$/);
    if (numero) {
      const alvo = String(Number(numero[1]));
      const catalogo = abertos.find((c) => String(Number(c.numero)) === alvo);
      if (!catalogo) return null;
      this.sessao.lembrarCatalogo(de, catalogo);
      return {
        resposta: `Certo — as próximas fotos vão para o #${catalogo.numero} ${catalogo.nome}.`,
        motivo: 'catalogo_lembrado',
      };
    }

    const analise = await this.lerLegenda(texto, abertos);
    if (!analise.catalogo && !analise.codigo) return null;

    // SO REFERENCIA, NENHUM OUTRO ASSUNTO. Pelo nome, o texto inteiro ja e
    // parte do nome do catalogo — e assim que `lerLegenda` casa nome. Pelo
    // numero ou pelo codigo, o que sobrou tem de ser so palavra de ligacao.
    if (!analise.porNome && !soLigacao(analise.resto)) return null;

    const partes: string[] = [];
    if (analise.catalogo) {
      this.sessao.lembrarCatalogo(de, analise.catalogo);
      partes.push(
        `as próximas fotos vão para o #${analise.catalogo.numero} ${analise.catalogo.nome}`,
      );
    }
    if (analise.codigo) {
      this.sessao.adiantarCodigo(de, {
        codigoErp: analise.codigo,
        parcelas: analise.parcelas,
        juros: analise.juros,
      });
      partes.push(`o código ${analise.codigo} vale para a próxima foto`);
    }

    return {
      resposta: `Certo — ${partes.join(', e ')}.`,
      motivo: analise.codigo ? 'codigo_adiantado' : 'catalogo_lembrado',
    };
  }

  // ---------------------------------------------------------------------------
  // Texto solto de quem cuida do catalogo
  // ---------------------------------------------------------------------------

  /**
   * O chao do canal, para quem tem `catalogo:write` e nao tem agente proprio.
   *
   * ==========================================================================
   * QUEM E DA CASA NAO PODE FALAR COM O VAZIO.
   *
   * O estoque manda foto e responde "aprovo". Escrevendo qualquer outra coisa,
   * ate 03/09/2026 caia na TRIAGEM — a Anastasia tentava qualificar a propria
   * equipe como cliente, e o telefone do estoque virava lead na fila de
   * encaminhamento da gestao.
   * ==========================================================================
   *
   * NAO SUBSTITUI NADA. O roteador tenta antes todos os caminhos que ja
   * existem — responder o catalogo, mandar o codigo, aprovar, buscar a peca.
   * Aqui chega o que sobrou, e a resposta e dizer o que este canal faz.
   *
   * SEM LLM, pelo mesmo motivo do resto do modulo: sao duas consultas e uma
   * frase. Um modelo acrescentaria latencia, custo e uma superficie de injecao
   * onde hoje nao existe nenhuma.
   */
  async conversa(de: string, nomeRemetente: string): Promise<RespostaFoto> {
    // A AJUDA ABRE A CONVERSA. A resposta lista os catalogos abertos, e o
    // `0003` que vier em seguida e resposta a ela — sem a conversa aberta,
    // cairia aqui de novo e receberia a mesma lista.
    this.sessao.abrirConversa(de);

    const [abertos, esperando] = await Promise.all([
      this.catalogos.listarAbertos(),
      this.catalogos.listarEmAprovacao(nomeRemetente.trim()),
    ]);

    const blocos: string[] = [];

    if (esperando.length > 0) {
      // A CATRACA SOBE JUNTO, e isto conserta um beco antigo: a marca de
      // aprovacao vive em memoria e some no restart do container. Sem ela, o
      // "aprovo" digitado depois nao era reconhecido e a pessoa ficava sem
      // saida — a tela aprova, mas nem todo mundo tem a tela aberta.
      this.sessao.marcarEmAprovacao(de);

      const nomes = esperando
        .map((f) => f.codigoErp ?? 'sem código')
        .join(', ');
      blocos.push(
        esperando.length === 1
          ? `Tem 1 foto esperando sua resposta: ${nomes}.`
          : `Tem ${esperando.length} fotos esperando sua resposta: ${nomes}.`,
      );
    }

    blocos.push(
      abertos.length > 0
        ? `Catálogos abertos:\n${abertos
            .map((c) => `#${c.numero} — ${c.nome}`)
            .join('\n')}`
        : 'Não tem catálogo aberto agora.',
    );

    // A FRASE DE AJUDA VAI SEMPRE, e por ultimo: quem escreveu nao sabia o que
    // este canal faz, senao teria escrito outra coisa.
    blocos.push(
      'Me manda a foto da peça que eu trato e te devolvo. Na legenda dá para ' +
        'dizer o catálogo, o código e o parcelamento — 0001 BR26252 10x.',
    );

    return { resposta: blocos.join('\n\n'), motivo: 'catalogo_conversa' };
  }

  // ---------------------------------------------------------------------------
  // Interno
  // ---------------------------------------------------------------------------

  /**
   * Grava a linha e monta a confirmacao. O descritivo vem do ERP pelo codigo —
   * ninguem redigita preco, que e onde o erro caro acontece.
   */
  private async guardarFoto(
    catalogo: CatalogoAberto,
    remetente: string,
    foto: FotoPendente,
    // Para onde mandar a versao tratada quando ela ficar pronta.
    chat: string,
  ): Promise<string> {
    const { descricao, preco } = await this.buscarNoErp(foto.codigoErp);

    // AGORA sabemos de qual catalogo a foto e, e so agora ela pode ir para a
    // pasta dele. Ate aqui viveu em `catalogo/pendentes/` — ver o cabecalho:
    // gravar antes de perguntar e o que impede a imagem de se perder enquanto
    // a vendedora responde.
    //
    // Se o `mover` falhar, ele devolve a chave ORIGINAL, e a linha aponta para
    // a area de espera. Imagem no lugar errado e melhor que linha sem imagem.
    const arquivoId = await this.armazenamento.mover(
      foto.arquivoId,
      pastaDoCatalogo(catalogo.numero, PASTA_ORIGINAIS),
    );

    const criada = await this.catalogos.criarFoto({
      catalogoId: catalogo.id,
      codigoErp: foto.codigoErp,
      descricao,
      precoAVista: preco,
      parcelas: foto.codigoErp ? (foto.parcelas ?? PARCELAS_PADRAO) : null,
      jurosPercentual: foto.juros ?? null,
      origem: 'WHATSAPP',
      remetente,
      arquivoOriginalId: arquivoId,
      // Aponta para o ORIGINAL ate a IA responder. Se o tratamento falhar, a
      // tela mostra o packshot cru — que ja serve para conferir enquadramento
      // e se a peca certa foi fotografada.
      arquivoId,
      mime: foto.mime,
      status: 'RECEBIDA',
    });

    // O TRATAMENTO NAO SEGURA A RESPOSTA. Gerar imagem leva 10 a 30 segundos, e
    // a pessoa fica olhando o WhatsApp — ela recebe "guardei" agora e a versao
    // tratada quando ficar pronta, podendo mandar a proxima peca no intervalo.
    void this.tratarEAvisar(criada.id, foto.pedidoDeEstilo ?? null, chat);

    // O AVISO DE QUE ALGO ESTA ACONTECENDO. Entre o "guardei" e a imagem
    // tratada passam de 10 a 60 segundos, e minuto calado no WhatsApp e lido
    // como "deu errado" — a pessoa reenvia a mesma foto, que entra duas vezes.
    // Uma linha resolve, e ela ja sai daqui sabendo o que esperar.
    const tratando = '\nEstou tratando a imagem, já te mando.';

    const alvo = `#${catalogo.numero} ${catalogo.nome}`;
    if (!foto.codigoErp) {
      // O CONVITE SÓ VALE SE ALGUÉM ESCUTAR. Marcar aqui é o que faz o
      // `BR26252` digitado em seguida encontrar esta foto — sem isto ele cai
      // nos agentes, e a Anastasia responde que o código não diz nada.
      this.sessao.esperarCodigo(chat, criada.id, alvo);
      return `Foto guardada em ${alvo}. Se quiser, me manda o código da peça — ou descreve ela ("anel de esmeralda"), que eu procuro.${tratando}`;
    }
    if (!descricao) {
      return `Foto guardada em ${alvo} com o código ${foto.codigoErp} — essa peça ainda não está no sistema, então ficou sem descrição e sem preço.${tratando}`;
    }
    return `Foto guardada em ${alvo}.\n${foto.codigoErp} · ${descricao}\n${this.emReais(preco)} à vista${tratando}`;
  }

  /**
   * ACHAR O CÓDIGO DA PEÇA NA LEGENDA — perguntando ao banco, não adivinhando.
   *
   * ==========================================================================
   * POR QUE A PERGUNTA É INVERTIDA.
   *
   * Até 04/09/2026 isto era uma expressão regular: duas letras seguidas de
   * dígitos, o padrão `CO26185` tirado dos catálogos impressos. Medido contra a
   * produção, ele reconhecia 5.919 dos 6.938 códigos — e errava os outros de
   * três jeitos diferentes:
   *
   *   9 códigos TÊM ESPAÇO      `TABUA QUEIJO  LAGUIO`, `CHIC STAYS`
   *   6 códigos têm 1 CARACTERE `1`, `2`
   *   alguns não têm DÍGITO     `PINGENTE`, `VASOITA`
   *
   * Não existe recorte por formato que cubra isso. Então a pergunta deixou de
   * ser "esta palavra parece um código?" e passou a ser "qual dos códigos que
   * eu tenho aparece aqui?".
   *
   * E O PIOR CASO NÃO ERA DEIXAR DE RECONHECER. Era reconhecer errado: como
   * `1-25-3A-2` não casava, ele sobrava no texto, e a busca do NÚMERO DO
   * CATÁLOGO mordia o `1` da frente. Sete peças reais da produção caem nisso,
   * e o catálogo #0001 existe — a foto ia para a coleção errada com uma
   * confirmação dizendo que deu certo.
   * ==========================================================================
   */
  private async acharCodigo(
    bruto: string,
  ): Promise<{ codigo: string | null; resto: string }> {
    if (!bruto) return { codigo: null, resto: bruto };

    // Já vêm do mais longo para o mais curto: numa legenda com `1-25-3A-2`
    // casa também o `1`, e quem vale é o maior.
    const candidatos = await this.produtos.buscarCodigosPresentesEm(bruto);

    for (const candidato of candidatos) {
      const pos = posicaoComBorda(bruto, candidato);
      if (pos < 0) continue;

      return {
        codigo: candidato.toUpperCase(),
        resto: bruto.slice(0, pos) + ' ' + bruto.slice(pos + candidato.length),
      };
    }

    // NENHUM CÓDIGO NOSSO NA LEGENDA — cai no formato de sempre.
    //
    // Isto não é apego ao código velho: `catalogo_fotos.codigo_erp` é SEM
    // chave estrangeira de propósito, porque a foto pode chegar antes de a
    // peça sincronizar do ERP. Recusar o desconhecido quebraria justamente a
    // peça nova, que é a que vai para catálogo novo.
    const m = bruto.match(RE_CODIGO);
    if (!m) return { codigo: null, resto: bruto };

    return {
      codigo: m[1].toUpperCase(),
      resto: bruto.replace(m[0], ' '),
    };
  }

  /**
   * Lê catálogo e código de um texto livre.
   *
   * A ORDEM IMPORTA: o código sai PRIMEIRO. `BR26252` tem dígitos dentro, e
   * procurar o número do catálogo antes acharia "26252" ali e mandaria a foto
   * para um catálogo que não existe — ou, pior, para um que existe.
   */
  private async lerLegenda(
    texto: string,
    abertos: CatalogoAberto[],
  ): Promise<{
    catalogo: CatalogoAberto | null;
    codigo: string | null;
    parcelas: number | null;
    /** Juro em %. `null` = nao informado, vale a regra da casa. */
    juros: number | null;
    pedidoDeEstilo: string | null;
    /** O catalogo foi achado pelo NOME — o texto inteiro que sobrou e parte dele. */
    porNome: boolean;
    /** O que sobrou depois de tirar codigo, parcelas, juro e numero. */
    resto: string;
  }> {
    const bruto = (texto ?? '').trim();

    const achado = await this.acharCodigo(bruto);
    const codigo = achado.codigo;
    let resto = achado.resto;

    const mParcelas = resto.match(RE_PARCELAS);
    const parcelas = mParcelas ? Number(mParcelas[1]) : null;
    if (mParcelas) resto = resto.replace(mParcelas[0], ' ');

    // O JURO SAI DEPOIS DAS PARCELAS, e a ordem e obrigatoria: em `12x 15%`,
    // procurar o percentual antes deixaria o `12x` intacto, mas procurar as
    // PARCELAS depois acharia... nada errado. O risco real e o inverso — o
    // numero do catalogo. Tirando parcelas e juro primeiro, o que sobrar de
    // digito e catalogo, e `15` deixa de poder virar catalogo #0015.
    const juros = this.lerJuros(resto);
    resto = resto.replace(RE_SEM_JUROS, ' ').replace(RE_JUROS, ' ');

    // Numero: casa contra os catalogos abertos, comparando sem os zeros a
    // esquerda — quem digita "2" quer o "0002".
    const mNumero = resto.match(RE_NUMERO);
    let catalogo: CatalogoAberto | null = null;
    if (mNumero) {
      const alvo = String(Number(mNumero[1]));
      catalogo = abertos.find((c) => String(Number(c.numero)) === alvo) ?? null;
      if (catalogo) resto = resto.replace(mNumero[0], ' ');
    }

    // Nome: so se o numero nao resolveu. Exige 3 caracteres para "de", "do" e
    // afins nao casarem com meio catalogo.
    let porNome = false;
    if (!catalogo) {
      const termo = normalizar(resto);
      if (termo.length >= 3) {
        const candidatos = abertos.filter((c) =>
          normalizar(c.nome).includes(termo),
        );
        // Ambiguo nao decide sozinho — cai na pergunta.
        if (candidatos.length === 1) {
          catalogo = candidatos[0];
          porNome = true;
        }
      }
    }

    return {
      catalogo,
      codigo,
      juros,
      porNome,
      resto,
      parcelas: parcelas && parcelas > 0 ? parcelas : null,
      // O QUE SOBROU E PEDIDO DE ESTILO. Tirados catalogo, codigo e parcelas, o
      // resto so pode ser instrucao para a imagem: "fundo rosa", "mais claro".
      // As palavras de comando saem — ninguem quer "catalogo" no prompt.
      pedidoDeEstilo: limparPedido(resto),
    };
  }

  /**
   * Apaga a foto de vez: os arquivos e a linha.
   *
   * OS ARQUIVOS SAEM PRIMEIRO. Apagando a linha antes, uma falha no S3
   * deixaria binario no bucket sem nenhuma linha que o nomeasse — ninguem
   * saberia depois o que aquilo era nem se podia sair. Na ordem inversa, a
   * falha deixa a linha, que continua legivel e retentavel.
   *
   * Os dois arquivos podem ser o MESMO quando a foto nunca foi tratada; o Set
   * evita o segundo `remover` numa chave que ja saiu.
   */
  private async jogarFora(foto: FotoItem): Promise<void> {
    const chaves = new Set(
      [foto.arquivoOriginalId, foto.arquivoId].filter((c): c is string => !!c),
    );
    for (const chave of chaves) {
      await this.armazenamento.remover(chave);
    }
    await this.catalogos.removerFoto(foto.id);
  }

  /**
   * Grava o codigo na foto que estava esperando, e confirma com o descritivo.
   *
   * DOIS CAMINHOS CHEGAM AQUI: o codigo digitado (`codigo`) e o escolhido na
   * lista da busca (`buscarPeca`). Um lugar so grava, entao os dois dizem a
   * mesma coisa de volta e o parcelamento funciona igual nos dois.
   *
   * @param resto o que sobrou da mensagem depois do codigo ou do numero —
   *   `6x`, `15%` — lido como parcelamento.
   * @param nomeRemetente quem aprova, quando a aprovacao veio antes.
   */
  private async anotarCodigo(
    de: string,
    pendente: CodigoEsperado,
    codigo: string,
    resto: string,
    nomeRemetente: string,
  ): Promise<RespostaFoto> {
    const { descricao, preco } = await this.buscarNoErp(codigo);

    const mParcelas = resto.match(RE_PARCELAS);
    const pedidas = mParcelas ? Number(mParcelas[1]) : null;
    const juros = this.lerJuros(resto);

    // Parcelamento so faz sentido com preco. Sem ele, deixar `10x` gravado
    // faria a tela calcular parcela de um valor que nao existe.
    const anotada = await this.catalogos.atualizarFoto(pendente.fotoId, {
      codigoErp: codigo,
      descricao,
      precoAVista: preco,
      parcelas:
        preco === null
          ? null
          : pedidas && pedidas > 0
            ? pedidas
            : PARCELAS_PADRAO,
      jurosPercentual: preco === null ? null : juros,
    });

    this.sessao.esquecerCodigo(de);

    // ==========================================================================
    // A APROVACAO QUE CHEGOU ANTES DO CODIGO — decisao do Lucas em 11/09.
    //
    // A pessoa disse "aprovo" com a foto sem codigo; eu guardei. Agora que o
    // codigo chegou, a foto fica completa e entra — sem pedir o "aprovo" de
    // novo.
    //
    // CONFERE O STATUS ANTES, e pelo banco: entre o "aprovo" e o codigo a
    // pessoa pode ter mandado refazer, e ai a imagem de agora nao e a que ela
    // aprovou. So publica o que ainda esta EM_APROVACAO.
    // ==========================================================================
    const publicar = pendente.aprovada && anotada?.status === 'EM_APROVACAO';
    if (publicar) {
      await this.catalogos.atualizarFoto(pendente.fotoId, {
        status: 'APROVADA',
        aprovadoPor: nomeRemetente,
        aprovadoEm: new Date(),
      });
    }
    // O CODIGO DA FOTO QUE A IA NAO TRATOU — 16/09/2026. Ele fica anotado nela
    // (e a foto certa: e a que a pessoa mandou), mas a foto nao anda sozinha.
    // Sem este aviso, quem mandou o codigo achava que a peca ja estava a
    // caminho do catalogo.
    const fecho = publicar
      ? '\nAprovada — já está no catálogo.'
      : anotada?.status === 'RECEBIDA' && this.sessao.fotoComFalha(de)
        ? `\nA foto ainda não foi tratada — responde "${TENTA_DE_NOVO}" que eu refaço.`
        : '';

    if (!descricao) {
      return {
        resposta:
          `Anotei ${codigo} na foto de ${pendente.alvo} — mas essa peça ainda não está no ` +
          `sistema, então ficou sem descrição e sem preço.${fecho}`,
        motivo: publicar ? 'foto_aprovada' : 'codigo_sem_produto',
      };
    }

    return {
      resposta: `${pendente.alvo}\n${codigo} · ${descricao}\n${this.emReais(preco)} à vista${fecho}`,
      motivo: publicar ? 'foto_aprovada' : 'codigo_anotado',
    };
  }

  /** As pecas que casam com a descricao, ja no formato da escolha. */
  private async procurar(termo: string): Promise<OpcaoPeca[]> {
    const produtos = await this.listarProdutos.execute({
      busca: termo,
      ativo: true,
      limit: MAX_OPCOES,
    });

    // SEM CODIGO NAO SERVE. A escolha existe para preencher `codigo_erp` na
    // foto — oferecer uma peca sem codigo seria oferecer um beco.
    return produtos
      .filter((p) => p.codigoErp)
      .map((p) => ({
        codigo: p.codigoErp!,
        descricao: p.descricaoEtiqueta ?? `${p.familia} ${p.categoria}`.trim(),
        preco: p.valorVenda,
      }));
  }

  /** A lista numerada, do jeito que ela chega no WhatsApp. */
  private listarOpcoes(opcoes: OpcaoPeca[]): string {
    const linhas = opcoes.map(
      (o, i) =>
        `${i + 1} · ${o.codigo} · ${o.descricao.toUpperCase()} · ${this.emReais(o.preco)}`,
    );

    // UMA OPCAO SO AINDA PERGUNTA, e a frase precisa deixar claro que ha
    // saida: nao e "confirma ou nada", e "confirma ou manda o codigo certo".
    if (opcoes.length === 1) {
      return [
        'Achei uma só:',
        linhas[0],
        'É ela? Me responde 1 pra confirmar — ou manda o código, se for outra.',
      ].join('\n');
    }

    return [
      `Achei ${opcoes.length}. Qual delas?`,
      ...linhas,
      'Me responde com o número.',
    ].join('\n');
  }

  /**
   * O descritivo da peca, pelo codigo.
   *
   * Peca ausente do ERP NAO e erro: ela pode ainda nao ter sido sincronizada.
   * A foto entra com o codigo escrito e sem descricao — e por isso que a
   * tabela nao tem FK para produtos.
   */
  private async buscarNoErp(
    codigo: string | null,
  ): Promise<{ descricao: string | null; preco: number | null }> {
    if (!codigo) return { descricao: null, preco: null };

    const produto = await this.produtos.findByCodigoErp(codigo);
    if (!produto) {
      this.logger.warn(
        `Peca ${codigo} nao encontrada no ERP — foto sem descritivo.`,
      );
      return { descricao: null, preco: null };
    }

    return {
      descricao:
        produto.descricaoEtiqueta ??
        `${produto.familia} ${produto.categoria}`.trim(),
      // `valorVenda` do ERP e o preco A VISTA — confirmado com o Lucas em
      // 28/08. O parcelado e derivado dele, nunca guardado.
      preco: produto.valorVenda,
    };
  }

  /** Como chamar a peca numa frase. Sem codigo, ela e so "a foto". */
  private rotulo(foto: FotoItem): string {
    return foto.codigoErp ? `a ${foto.codigoErp}` : 'a foto';
  }

  private confirmarAprovacao(
    aprovadas: FotoItem[],
    restantes: FotoItem[],
  ): string {
    const cabeca =
      aprovadas.length === 1
        ? `${aprovadas[0].codigoErp ?? 'Foto'} aprovada — já está no catálogo.`
        : `${aprovadas.length} fotos aprovadas — já estão no catálogo.`;

    return `${cabeca}${this.eSobraram(restantes)}`;
  }

  /**
   * O que ainda espera resposta — NOMEANDO a próxima.
   *
   * ==========================================================================
   * NÃO CRIE UMA PERGUNTA QUE VOCÊ NÃO SABE RESPONDER.
   *
   * Antes esta linha dizia só "Ainda tenho 1 esperando sua resposta", e em
   * 31/08 o Lucas respondeu o óbvio: "qual?". Aquele "qual?" não é veredito
   * nenhum, então cai nos agentes — e a conversa morre, porque a Anastasia não
   * sabe do que ele está falando.
   *
   * A saída não é ensinar a responder "qual?": é dizer o nome de uma vez. Um
   * aviso que provoca pergunta previsível está pela metade.
   * ==========================================================================
   */
  private eSobraram(restantes: FotoItem[]): string {
    if (restantes.length === 0) return '';
    if (restantes.length === 1) {
      return `\nAinda falta ${this.rotulo(restantes[0])}.`;
    }
    return (
      `\nAinda faltam ${restantes.length} — a próxima é ` +
      `${this.rotulo(restantes[0])}.`
    );
  }

  /**
   * O juro dito no texto. `null` quando nada foi dito.
   *
   * "SEM JUROS" VEM PRIMEIRO porque ele e uma afirmacao, e nao a falta de uma:
   * zero e um valor. Sem essa ordem, "10x sem juros" cairia no `null` e a peca
   * sairia com o acrescimo padrao — o oposto exato do que foi pedido.
   */
  private lerJuros(texto: string): number | null {
    if (RE_SEM_JUROS.test(normalizar(texto))) return 0;

    const m = texto.match(RE_JUROS);
    if (!m) return null;

    const valor = Number(m[1]);
    return Number.isFinite(valor) && valor >= 0 ? valor : null;
  }

  private perguntarCatalogo(abertos: CatalogoAberto[]): string {
    const lista = abertos.map((c) => `#${c.numero} — ${c.nome}`).join('\n');
    return `De qual catálogo é?\n${lista}\n\nResponde com o número ou o nome.`;
  }

  private emReais(valor: number | null): string {
    if (valor === null) return '—';
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  /**
   * Levanta de volta a catraca da aprovacao a partir do banco.
   *
   * POR QUE EXISTE: a catraca vive em memoria, e um restart do container a
   * perde. As fotos continuam EM_APROVACAO — o trabalho esta salvo —, mas o
   * "aprovo" dela deixaria de ser reconhecido, e a tela nao aprova de
   * proposito. A pessoa ficaria sem saida nenhuma.
   *
   * Entao a proxima foto reconstroi: quem manda foto quase sempre tem outras
   * esperando resposta, e este e o unico caminho em que ja pagamos uma ida ao
   * banco de qualquer forma. So consulta com a catraca BAIXA — com ela
   * levantada nao ha nada a reconstruir.
   */
  private async rearmarAprovacao(de: string, remetente: string): Promise<void> {
    if (this.sessao.temEmAprovacao(de)) return;

    const fila = await this.catalogos.listarEmAprovacao(remetente.trim());
    if (fila.length > 0) this.sessao.marcarEmAprovacao(de);
  }

  /**
   * Apaga o que expirou sem ninguem dizer a que catalogo pertencia — E AVISA
   * quem mandou.
   *
   * ==========================================================================
   * A FOTO NAO SOME MAIS CALADA. Ate 11/09/2026 ela sumia: em 10/09 o Yerlon
   * mandou uma foto, nao respondeu "de qual catalogo", e meia hora depois ela
   * nao existia mais — sem uma palavra. Quem mandou acha que deu certo.
   * ==========================================================================
   *
   * Roda em dois lugares: no comeco de cada foto (como sempre rodou) e num
   * temporizador, porque quem esqueceu de responder nao vai mandar outra foto
   * para disparar a varredura.
   *
   * Nada aqui pode estourar para fora: e limpeza, e roda tambem de dentro do
   * fluxo de uma foto que nao tem nada a ver com as vencidas.
   */
  private async varrerExpiradas(): Promise<void> {
    const vencidas = this.sessao.recolherVencidas();

    for (const [chat, fotos] of vencidas) {
      try {
        await Promise.all(
          fotos.map((f) => this.armazenamento.remover(f.arquivoId)),
        );
        await this.whatsapp.enviarTexto(
          chat,
          fotos.length === 1
            ? 'A foto que você mandou ficou meia hora sem catálogo, e eu descartei — ninguém me disse de qual era. ' +
                'Se ainda quiser, manda de novo com o número na legenda, assim: 0003.'
            : `As ${fotos.length} fotos que você mandou ficaram meia hora sem catálogo, e eu descartei — ninguém me disse de qual eram. ` +
                'Se ainda quiser, manda de novo com o número na legenda, assim: 0003.',
        );
      } catch (err) {
        this.logger.error(
          `Falha ao descartar/avisar fotos vencidas: ${String(err)}`,
        );
      }
    }

    this.agendarVarredura();
  }

  /**
   * Agenda a proxima varredura para quando vencer a proxima sessao com foto
   * pendurada. Sem nenhuma, nao agenda nada — o Map quase sempre esta vazio, e
   * um `setInterval` fixo so existiria para varrer o vazio.
   *
   * O `unref` e para o temporizador nao segurar o processo de pe no desligar.
   */
  private agendarVarredura(): void {
    if (this.varredura) clearTimeout(this.varredura);
    this.varredura = null;

    const falta = this.sessao.proximoVencimento();
    if (falta === null) return;

    this.varredura = setTimeout(() => {
      this.varredura = null;
      void this.varrerExpiradas();
    }, falta + 1000);
    this.varredura.unref?.();
  }
}

/** Minusculas, sem acento e sem pontuacao — para casar nome digitado no celular. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento, ja separadas pelo NFD
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Onde `alvo` aparece em `texto` COM BORDA — ou -1.
 *
 * Borda é: o que vem antes e depois não pode ser letra nem dígito. Sem isso, o
 * código `1` — que existe, seis peças o têm — casaria dentro de `CO26185`, e
 * toda legenda passaria a ter um código.
 *
 * NÃO USA `\b` DE EXPRESSÃO REGULAR, e a diferença importa: `\b` considera
 * hífen e barra como separadores, então `1-25-3A-2` teria borda no meio dele
 * mesmo e o `1` casaria ali dentro. Aqui a borda é a ausência de alfanumérico,
 * que é o que separa um código de outro numa legenda escrita por gente.
 *
 * Compara em MAIÚSCULA porque a legenda vem como a pessoa digitou e os códigos
 * da base estão todos em caixa alta (conferido: 6.938 de 6.938).
 */
function posicaoComBorda(texto: string, alvo: string): number {
  const t = texto.toUpperCase();
  const a = alvo.toUpperCase();
  if (!a) return -1;

  const alfanumerico = (c: string | undefined) =>
    c !== undefined && /[A-Z0-9]/.test(c);

  // Percorre TODAS as ocorrências: o código pode aparecer primeiro no meio de
  // outra palavra e depois sozinho.
  let de = 0;
  for (;;) {
    const i = t.indexOf(a, de);
    if (i < 0) return -1;

    const antes = i > 0 ? t[i - 1] : undefined;
    const depois = i + a.length < t.length ? t[i + a.length] : undefined;
    if (!alfanumerico(antes) && !alfanumerico(depois)) return i;

    de = i + 1;
  }
}
