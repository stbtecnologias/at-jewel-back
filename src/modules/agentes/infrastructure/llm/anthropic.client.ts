import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ChatComFerramentasResultado,
  ChatParams,
  GestaoLeituraResultado,
  ChatResultado,
  GraficoDinamico,
  ILlmClient,
  PeriodoAgendaLlm,
  StatusLeadLlm,
  PeriodoVendasLlm,
} from '../../domain/ports/llm-client.port';

// Ferramenta de geracao de grafico (Anthropic tool-use). Vive aqui porque o
// schema e especifico do SDK; o dominio so conhece GraficoDinamico.
const CHART_TOOL: Anthropic.Tool = {
  name: 'gerar_grafico',
  description:
    'Gera um gráfico interativo exibido no painel de Analytics. Use quando dados ficam mais claros com visualização — comparações, tendências, distribuições.',
  input_schema: {
    type: 'object',
    properties: {
      tipo: {
        type: 'string',
        enum: ['bar', 'line', 'pie', 'composed'],
        description:
          'bar = barras; line = linha; pie = pizza; composed = barras + linha',
      },
      titulo: { type: 'string', description: 'Título descritivo do gráfico' },
      dados: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array de objetos — cada objeto é um ponto no gráfico',
      },
      chave_x: { type: 'string', description: 'Propriedade que vai no eixo X' },
      chaves_y: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            chave: { type: 'string' },
            cor: { type: 'string', description: 'Cor hex, ex: #f59e0b' },
            rotulo: { type: 'string' },
          },
          required: ['chave', 'cor', 'rotulo'],
        },
        description: 'Uma ou mais séries de dados para o eixo Y',
      },
    },
    required: ['tipo', 'titulo', 'dados', 'chave_x', 'chaves_y'],
  },
};

interface ChartToolInput {
  tipo: GraficoDinamico['type'];
  titulo: string;
  dados: Array<Record<string, unknown>>;
  chave_x: string;
  chaves_y: { chave: string; cor: string; rotulo: string }[];
}

// Ferramenta de registro de demanda (RF-24). So e enviada ao modelo quando a
// aplicacao fornece um handler (ChatParams.registrarDemanda) — a persona da
// Anastasia no painel. O efeito colateral (gravar a demanda) roda no handler.
const DEMANDA_TOOL: Anthropic.Tool = {
  name: 'registrar_demanda',
  description:
    'Registra uma solicitação (demanda) da usuária para a equipe técnica quando você não consegue resolver na conversa ou quando a usuária pedir explicitamente para registrar. Use para pedidos de relatório novo, ajuste no sistema, dúvida técnica ou outro. Não use para responder algo que você mesma já consegue resolver.',
  input_schema: {
    type: 'object',
    properties: {
      tipo: {
        type: 'string',
        enum: ['RELATORIO', 'AJUSTE', 'DUVIDA', 'OUTRO'],
        description:
          'RELATORIO = pedido de relatório/visão nova; AJUSTE = ajuste ou correção no sistema; DUVIDA = dúvida operacional; OUTRO = não se encaixa',
      },
      descricao: {
        type: 'string',
        description:
          'Descrição objetiva do que a usuária precisa, em uma ou duas frases. Sem dados pessoais de clientes.',
      },
    },
    required: ['tipo', 'descricao'],
  },
};

const AGENDA_TOOL: Anthropic.Tool = {
  name: 'consultar_agenda',
  description:
    'Consulta os compromissos JA AGENDADOS de quem esta falando com voce. Use quando ela perguntar sobre a agenda dela — "como esta minha agenda hoje", "tenho algum contato amanha", "o que tenho essa semana". Devolve com quem ela combinou de falar e a que horas. Voce NAO escolhe de quem e a agenda: e sempre a de quem esta na conversa, resolvida pelo telefone. Se ela perguntar pela agenda de outra pessoa, diga que voce so enxerga a dela.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: {
        type: 'string',
        enum: ['HOJE', 'AMANHA', 'SEMANA'],
        description:
          'HOJE = o que ainda vem hoje; AMANHA = o dia seguinte inteiro; SEMANA = os proximos sete dias. Na duvida, use HOJE.',
      },
    },
    required: ['periodo'],
  },
};

/**
 * O PERIODO LIVRE, nas tres ferramentas de venda — 28/09/2026.
 *
 * ==========================================================================
 * NASCEU DE UMA RECUSA QUE NAO DEVIA EXISTIR.
 *
 * O Lucas perguntou "o que a Camila mais vendeu nos ultimos 6 meses" e a
 * Anastasia respondeu que "nao da para escolher exatamente seis meses — as
 * opcoes sao hoje, ontem, semana, mes ou ano".
 *
 * Era limitacao NOSSA, numa pergunta que o banco responde sem esforco: os
 * metodos `resumoEntre`, `itensEntre` e `rankingEntre` existiam desde 25/09 e
 * ninguem os chamava. A ferramenta so sabia falar o enum.
 *
 * O ENUM FICA, e nao e redundancia: `MES` e `ANO` sao os do CALENDARIO, que e
 * o que se compara com a meta. O modelo calculando "o mes" chutaria trinta
 * dias para tras e daria um numero que nao bate com nada que a gestao segue.
 *
 * DUPLICADO NAS TRES de proposito — a descricao de `periodo` e diferente em
 * cada uma (enums diferentes, padroes diferentes), entao so este par e comum.
 * ==========================================================================
 */
const DATAS_LIVRES = {
  de: {
    type: 'string' as const,
    description:
      'Inicio do periodo, AAAA-MM-DD. Use com `ate` quando o recorte pedido nao couber no `periodo`: "ultimos 6 meses", "de janeiro a marco", "agosto", "do dia 10 ate hoje". VOCE calcula as datas a partir da data de hoje, que esta no inicio desta conversa.',
  },
  ate: {
    type: 'string' as const,
    description:
      'Fim do periodo, AAAA-MM-DD, e ele CONTA INTEIRO. So vale junto com `de` — mandando um so, ele e ignorado. Com os dois preenchidos, o `periodo` nao e usado.',
  },
};

const VENDAS_TOOL: Anthropic.Tool = {
  name: 'consultar_vendas',
  description:
    'Consulta quantas vendas ELA fez e quanto faturou num periodo. Use quando ela perguntar sobre o proprio desempenho — "quantas vendas eu fiz hoje", "como foi minha semana", "quanto vendi no mes", "e no ano?". Sao sempre as vendas DELA: voce nao escolhe de quem, o sistema resolve pelo telefone de quem esta falando.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: {
        type: 'string',
        // ONTEM e ANO entraram em 28/09/2026 — o use case sempre respondeu os
        // cinco, e so a ferramenta era estreita.
        enum: ['HOJE', 'ONTEM', 'SEMANA', 'MES', 'ANO'],
        description:
          // A DESCRICAO ANTIGA MENTIA: dizia "MES = os ultimos trinta dias", e
          // a janela sempre foi do dia 1. A agente repetia isso na resposta
          // ("nos ultimos trinta dias voce nao fechou nenhuma venda") enquanto
          // o numero era do mes do calendario.
          'HOJE = desde a meia-noite; ONTEM = o dia anterior inteiro; SEMANA = os ultimos sete dias; MES = do dia 1 ate agora; ANO = de 1o de janeiro ate agora. MES e ANO sao os do CALENDARIO, nao janelas moveis.',
      },
      ...DATAS_LIVRES,
    },
    required: [],
  },
};

const METAS_TOOL: Anthropic.Tool = {
  name: 'consultar_metas',
  description:
    'Consulta as metas DELA: qual o alvo, quanto ja realizou, quanto falta e se ja bateu. Use quando ela perguntar sobre meta — "bati minha meta?", "quanto falta pra minha meta", "quais metas eu tenho". Nao precisa passar nada.',
  input_schema: { type: 'object', properties: {} },
};

const PRODUTOS_TOOL: Anthropic.Tool = {
  name: 'consultar_produtos',
  description:
    'Procura pecas no catalogo e devolve descricao, preco de venda e SE A PECA ESTA DISPONIVEL (disponivel/indisponivel). NAO ha quantidade: se perguntarem quantas tem, diga que voce ve apenas se a peca esta disponivel. Use quando ela perguntar sobre produto — "quanto custa o brinco de esmeralda", "tem alianca de ouro 18k", "quantos pingentes de zirconia temos". Devolve no maximo seis pecas. Voce nao tem acesso a custo nem margem: se ela perguntar isso, diga que nao consegue ver.',
  input_schema: {
    type: 'object',
    properties: {
      busca: {
        type: 'string',
        description:
          'O que procurar, nas palavras dela: nome da peca, categoria, familia, colecao, pedra, cor ou codigo do ERP. Ex.: "esmeralda", "alianca ouro 18k", "SEED-P0002".',
      },
    },
    required: ['busca'],
  },
};

/**
 * O MESMO NOME, OUTRO CONTEUDO — e os dois nunca convivem.
 *
 * A vendedora ve disponivel/indisponivel; a gestao ve a quantidade. Sao dois
 * handlers diferentes e dois canais diferentes, entao so um deles e
 * registrado por chamada. O registro abaixo confere isso explicitamente.
 */
const GESTAO_PRODUTOS_TOOL: Anthropic.Tool = {
  name: 'consultar_produtos',
  description:
    'Procura pecas no catalogo e devolve descricao, preco de venda e QUANTIDADE em estoque. Use quando perguntarem sobre produto — "quanto custa o brinco de esmeralda", "quantos aneis de diamante temos", "tem o CO25413".',
  input_schema: {
    type: 'object',
    properties: {
      busca: {
        type: 'string',
        description:
          'O que procurar: nome da peca, categoria, familia, colecao, pedra, cor ou codigo do ERP.',
      },
    },
    required: ['busca'],
  },
};

const MEUS_LEADS_TOOL: Anthropic.Tool = {
  name: 'meus_leads',
  description:
    'Lista os LEADS que a gestao encaminhou PARA ELA: nome, o que a pessoa procura, a ocasiao, ha quanto tempo chegou e o TELEFONE para ela entrar em contato. Use quando ela perguntar "tem lead para mim", "o que me mandaram", "quais clientes novos eu recebi", "me passa o contato daquele lead". Nao precisa passar nada. So enxerga os leads encaminhados para ela. Lead NAO e cliente da carteira: para atendimento em curso, use consultar_minha_carteira. LEAD NAO PODE SER AGENDADO — ele nao tem cadastro de cliente, e agendar_contato so aceita cliente da carteira. Nao ofereca marcar contato com um lead.',
  input_schema: { type: 'object', properties: {} },
};

const ATUALIZAR_LEAD_TOOL: Anthropic.Tool = {
  name: 'atualizar_lead',
  description:
    'Muda o STATUS de um lead que foi encaminhado para ela, e guarda uma observacao dela junto. Use quando ela contar o que aconteceu com um lead — "ja falei com o Aslan", "o Aslan comprou", "esse nao quis nada", "pode dar baixa nesse", "nao atendeu tres vezes". LEAD, e nao cliente: para cliente da carteira use registrar_relato ou agendar_contato. So alcanca os leads encaminhados para ela. Identifique o lead pelo NOME como ela falou — nao invente nome nem peca codigo. Se ela nao disser em que pe ficou, PERGUNTE antes de chamar; nao escolha o status por ela. Em NAO_VINGOU, pergunte o MOTIVO junto da confirmacao e mande a resposta em `observacao` — uma vez so, e sem insistir se ela nao quiser dizer.',
  input_schema: {
    type: 'object',
    properties: {
      lead: {
        type: 'string',
        description:
          'O nome do lead como ela escreveu. Nao complete nem corrija o sobrenome.',
      },
      status: {
        type: 'string',
        enum: ['NOVO', 'EM_CONTATO', 'VIROU_CLIENTE', 'NAO_VINGOU'],
        description:
          'EM_CONTATO = ela ja falou com a pessoa e aquilo esta andando. VIROU_CLIENTE = comprou, ou virou cadastro. NAO_VINGOU = a baixa, por qualquer motivo. NOVO = so para DESFAZER uma baixa dada por engano.',
      },
      observacao: {
        type: 'string',
        description:
          'SO O QUE ELA ACABOU DE FALAR — o sistema soma isto ao que ja estava anotado, com a data. Nao repita observacao antiga: ela apareceria duas vezes. Em NAO_VINGOU, e aqui que vai o MOTIVO ("achou caro", "nao atende", "comprou em outro lugar"). Omita se ela so mudou o status; mandar vazio APAGA o historico inteiro.',
      },
    },
    required: ['lead', 'status'],
  },
};

const CARTEIRA_AGORA_TOOL: Anthropic.Tool = {
  name: 'consultar_minha_carteira',
  description:
    'Diz como esta a carteira DELA agora: quantos clientes ela tem com atendimento em curso, em que pe cada grupo esta (em negociacao, remarcado, sem conseguir falar, primeiro contato) e quantos estao esperando o relato dela. Use quando ela perguntar "como esta minha carteira", "quantos clientes eu tenho em aberto", "o que esta parado comigo", "de quem eu preciso dar noticia", "quantos atendimentos eu tenho". Nao precisa passar nada. So enxerga a carteira dela. E o estado de AGORA, nao um periodo — nao diga "hoje" nem "esta semana" ao repassar. Nao traz venda nem valor: se ela perguntar quanto vendeu, use consultar_vendas.',
  input_schema: { type: 'object', properties: {} },
};

const SEM_COMPRAR_TOOL: Anthropic.Tool = {
  name: 'clientes_sem_comprar',
  description:
    'Lista clientes DA CARTEIRA DELA que estao ha algum tempo sem comprar, do mais parado para o menos. Use quando ela perguntar quem esta sumido, parado, ha quanto tempo alguem nao compra, ou quem ela deveria procurar. Inclui quem nunca comprou. So enxerga a carteira dela.',
  input_schema: {
    type: 'object',
    properties: {
      meses: {
        type: 'integer',
        description:
          'Quantos MESES sem comprar. O padrao quando ela nao disser nada: 6.',
      },
      dias: {
        type: 'integer',
        description:
          'Quantos DIAS sem comprar. Use quando ela falar em dias ou semanas ("ha 45 dias", "ha duas semanas"), em vez de arredondar para meses.',
      },
      desde: {
        type: 'string',
        description:
          'Data no formato AAAA-MM-DD, quando ela der uma data ou um mes ("desde julho", "desde 10/03"). Mais especifico que os outros dois.',
      },
    },
  },
};

/**
 * QUEM COMPRA NAQUELA EPOCA — 01/10/2026.
 *
 * UMA ferramenta para mes E data comemorativa, e nao duas: para quem conversa
 * e a mesma pergunta, e duas ferramentas parecidas e o que faz o modelo
 * escolher a errada.
 */
const EPOCA_TOOL: Anthropic.Tool = {
  name: 'clientes_por_epoca',
  description:
    'Lista os clientes DA CARTEIRA DELA que mais compram numa EPOCA do ano, somando TODOS OS ANOS do historico. Use para "quem mais compra em outubro", "quem compra no Dia das Maes", "quem some no Natal". Informe UM dos dois: o mes OU a data comemorativa. So enxerga a carteira dela.',
  input_schema: {
    type: 'object',
    properties: {
      mes: {
        type: 'integer',
        description: 'O mes, de 1 a 12. Use quando ela citar um mes do ano.',
      },
      dataComemorativa: {
        type: 'string',
        enum: [
          'Carnaval',
          'Páscoa',
          'Dia das Mães',
          'Dia dos Namorados',
          'Dia dos Pais',
          'Natal',
        ],
        description:
          'A data comemorativa. A janela considerada sao os 15 dias que antecedem a data, em cada ano — e quando a joia e comprada.',
      },
    },
  },
};

const MELHORES_TOOL: Anthropic.Tool = {
  name: 'melhores_clientes',
  description:
    'Lista os clientes DA CARTEIRA DELA que mais compraram, do maior para o menor. Sem categoria conta COMPRAS ("quem mais compra de mim"); com categoria conta PECAS daquele tipo ("quem comprou mais aneis"). So enxerga a carteira dela.',
  input_schema: {
    type: 'object',
    properties: {
      categoria: {
        type: 'string',
        description:
          'Categoria da peca, no singular, como aparece no catalogo: "Anel", "Colar", "Brinco", "Pulseira", "Pingente", "Alianca". Omita para contar todas as compras.',
      },
      ultimos_meses: {
        type: 'integer',
        description:
          'Recorte de periodo, em meses. Omita para considerar o historico inteiro.',
      },
    },
  },
};

// ===========================================================================
// GESTAO. Espelham as de cima, mas pedem DE QUEM — e por isso sao ferramentas
// distintas, e nao as mesmas com um parametro a mais. Um canal recebe um
// conjunto, o outro recebe o outro; nunca os dois.
// ===========================================================================

const GESTAO_AGENDA_TOOL: Anthropic.Tool = {
  name: 'agenda_de_vendedora',
  description:
    'Consulta os compromissos ja agendados. COM "vendedora", a agenda daquela pessoa — "como esta o dia da Marina", "a Beatriz tem contato amanha". SEM "vendedora", a agenda de TODA a equipe de uma vez, uma linha por pessoa — use assim para "a agenda de hoje da equipe toda", "quem tem contato marcado hoje", "como esta o dia do time". NAO peca os nomes um a um e NAO diga que so da para consultar uma por vez: omitir o campo ja traz todas. CHAME MESMO SEM SABER O PERIODO: a ferramenta tambem e quem confirma se a vendedora existe, e perguntar o periodo antes daria a entender que ela existe. Passe o nome como veio na conversa; se houver mais de uma com aquele nome, ou nenhuma, a ferramenta avisa e ai voce pergunta.',
  input_schema: {
    type: 'object',
    properties: {
      vendedora: {
        type: 'string',
        description:
          'Nome da vendedora, como falado. OMITA para a equipe inteira — nao invente um nome quando a pergunta for do time.',
      },
      periodo: {
        type: 'string',
        enum: ['HOJE', 'AMANHA', 'SEMANA'],
        description:
          'HOJE = o que ainda vem hoje; AMANHA = o dia seguinte inteiro; SEMANA = os proximos sete dias. Omita se nao souber — assume HOJE, e voce diz na resposta que olhou o dia de hoje.',
      },
    },
  },
};

const GESTAO_VENDAS_TOOL: Anthropic.Tool = {
  name: 'vendas_de_vendedora',
  description:
    'Consulta quantas vendas UMA vendedora fez e quanto faturou num periodo. Use para "quanto a Marina vendeu essa semana", "como foi o mes da Beatriz". CHAME MESMO SEM SABER O PERIODO: e tambem esta ferramenta que confirma se a vendedora existe. Para comparar a equipe inteira, use panorama_da_equipe.',
  input_schema: {
    type: 'object',
    properties: {
      vendedora: {
        type: 'string',
        description: 'Nome da vendedora, como falado.',
      },
      periodo: {
        type: 'string',
        enum: ['HOJE', 'SEMANA', 'MES'],
        description:
          'HOJE = desde a meia-noite; SEMANA = os ultimos sete dias; MES = os ultimos trinta dias. Omita se nao souber — assume SEMANA, e voce diz na resposta qual recorte usou.',
      },
      ...DATAS_LIVRES,
    },
    required: ['vendedora'],
  },
};

const GESTAO_METAS_TOOL: Anthropic.Tool = {
  name: 'metas_de_vendedora',
  description:
    'Consulta as metas de UMA vendedora: alvo, quanto realizou, quanto falta e se bateu. Use para "a Marina bateu a meta?", "quanto falta pra meta da Beatriz".',
  input_schema: {
    type: 'object',
    properties: {
      vendedora: {
        type: 'string',
        description: 'Nome da vendedora, como falado.',
      },
    },
    required: ['vendedora'],
  },
};

const GESTAO_PANORAMA_TOOL: Anthropic.Tool = {
  name: 'panorama_da_equipe',
  description:
    'Compara as vendas da equipe num periodo, da maior para a menor. Use quando a pergunta for sobre a equipe e nao sobre uma pessoa — "como foi a semana da equipe", "quem vendeu mais esse mes", "quem esta atras". Quem vendeu no periodo aparece, mesmo tendo saido depois; quem continua na equipe e nao vendeu aparece no fim.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: {
        type: 'string',
        enum: ['HOJE', 'SEMANA', 'MES'],
        description:
          'HOJE, SEMANA (sete dias) ou MES — o mes do CALENDARIO, do dia 1 ate agora, que e o que se compara com a meta.',
      },
      ...DATAS_LIVRES,
    },
    required: [],
  },
};

/**
 * O QUE MAIS SAIU — 25/09/2026, e ela nao existia.
 *
 * Das 29 ferramentas, a unica que falava de produto era `consultar_produtos`,
 * que responde preco e estoque: catalogo, nao historico. "Qual peca mais
 * vendeu em agosto" nao tinha como ser respondido.
 *
 * ORDENA POR VALOR, e nao por quantidade: numa joalheria a peca que sai dez
 * vezes costuma ser a mais barata da vitrine, e "o que mais vendeu" no sentido
 * que interessa a gestao e o que mais FATUROU.
 */
const GESTAO_ITENS_TOOL: Anthropic.Tool = {
  name: 'itens_mais_vendidos',
  description:
    'As pecas que mais faturaram num periodo, da maior para a menor, com quantidade e valor. Use para "qual peca mais vendeu", "o que mais saiu esse mes", "quais as pecas do mes". Devolve 10 por padrao; se ela pedir outro numero ("me da o top 5"), passe em `limite`. Com `vendedora`, so as pecas que AQUELA vendedora vendeu.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: {
        type: 'string',
        enum: ['HOJE', 'ONTEM', 'SEMANA', 'MES', 'ANO'],
        description:
          'HOJE (o padrao), ONTEM, SEMANA (sete dias), MES ou ANO — mes e ano sao os do CALENDARIO, nao janelas moveis.',
      },
      limite: {
        type: 'number',
        description: 'Quantas pecas listar. Padrao 10, teto 30.',
      },
      vendedora: {
        type: 'string',
        description:
          'Nome de uma vendedora, como veio na conversa, para recortar so as pecas dela. Omita para a loja inteira.',
      },
      ...DATAS_LIVRES,
    },
    required: [],
  },
};

/**
 * A MESMA FERRAMENTA, PARA QUEM NAO VE A LOJA — 28/09/2026.
 *
 * Quem gerencia as vendedoras (papel GERENTE_VENDAS, sem `analytics:read`)
 * pergunta "o que a Camila mais vendeu" e nunca "o que a loja mais vendeu": o
 * `itens_mais_vendidos` sem vendedora e a unica das 17 ferramentas de gestao
 * que responde sobre a loja inteira, em dinheiro.
 *
 * ==========================================================================
 * E UMA SEGUNDA TOOL, E NAO UM AVISO NO SYSTEM PROMPT.
 *
 * Instruir o modelo a "nao perguntar pela loja" seria regra de prompt, e prompt
 * nao e permissao: basta a conversa tomar outro rumo para ele tentar. Aqui a
 * pergunta nao chega a existir — o `required` faz a propria API recusar a
 * chamada sem vendedora.
 *
 * E o mesmo principio do canal da vendedora, onde o escopo e AUSENCIA DE
 * CAMINHO e nao regra escrita: la nenhuma ferramenta aceita "de quem".
 * ==========================================================================
 *
 * A descricao tambem muda, e nao so o `required`. Ela e o que o modelo le para
 * decidir se a ferramenta serve: deixar "omita para a loja inteira" ali faria
 * ele oferecer a quem nao pode, e depois se desculpar.
 */
const GESTAO_ITENS_DA_VENDEDORA_TOOL: Anthropic.Tool = {
  name: 'itens_mais_vendidos',
  description:
    'As pecas que uma VENDEDORA mais faturou num periodo, da maior para a menor, com quantidade e valor. Use para "o que a Camila mais vendeu esse mes", "quais pecas sairam com a Marina". Devolve 10 por padrao; se ela pedir outro numero ("me da o top 5"), passe em `limite`. SEMPRE exige a vendedora — esta consulta nao responde pela loja inteira. Se ela perguntar "o que mais vendeu" sem dizer de quem, pergunte de qual vendedora.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: {
        type: 'string',
        enum: ['HOJE', 'ONTEM', 'SEMANA', 'MES', 'ANO'],
        description:
          'HOJE (o padrao), ONTEM, SEMANA (sete dias), MES ou ANO — mes e ano sao os do CALENDARIO, nao janelas moveis.',
      },
      limite: {
        type: 'number',
        description: 'Quantas pecas listar. Padrao 10, teto 30.',
      },
      vendedora: {
        type: 'string',
        description: 'Nome da vendedora, como veio na conversa.',
      },
      ...DATAS_LIVRES,
    },
    required: ['vendedora'],
  },
};

/**
 * QUEM MAIS VENDE UM TIPO DE PECA — 28/09/2026.
 *
 * ==========================================================================
 * A PERGUNTA QUE NENHUMA DAS OUTRAS RESPONDIA.
 *
 * "Qual a vendedora que mais vende brinco?" caia num vao: o
 * `panorama_da_equipe` soma TUDO que cada uma vendeu, sem separar tipo, e o
 * `itens_mais_vendidos` separa tipo mas agrupa por PECA. A agente respondia
 * "nao da para cruzar", e estava certa.
 *
 * ORDENADO POR QUANTIDADE, ao contrario das outras: "quem mais vende brinco"
 * espera "a Aline, 23 brincos". O valor vai na mesma linha.
 * ==========================================================================
 */
const GESTAO_POR_FAMILIA_TOOL: Anthropic.Tool = {
  name: 'quem_mais_vende',
  description:
    'O ranking das vendedoras para UM tipo de peca, da que mais vendeu para a que menos vendeu, com quantidade e valor. Use para "quem vende mais brinco", "qual vendedora mais vendeu anel esse ano", "quem e a melhor em colar". Conta PECAS, nao faturamento — e a devolucao ja esta abatida. Para o ranking geral, sem separar tipo, use panorama_da_equipe.',
  input_schema: {
    type: 'object',
    properties: {
      familia: {
        type: 'string',
        description:
          'O tipo de peca, como a pessoa falou: "brinco", "anel", "colar", "pulseira". Se o nome nao existir no catalogo, a resposta traz a lista dos que existem — repasse e pergunte qual.',
      },
      periodo: {
        type: 'string',
        enum: ['HOJE', 'ONTEM', 'SEMANA', 'MES', 'ANO'],
        description:
          'MES (o padrao) e ANO sao os do CALENDARIO. Para um mes especifico de um ano passado — "outubro de 2025" — use `de` e `ate`.',
      },
      mes: {
        type: 'number',
        description:
          'De 1 a 12 — use quando ela disser um mes SEM ano: "em outubro", "nos meses de dezembro", "no natal". Traz TODOS os anos, quebrado por ano ("outubro/2025 — Fulana: 4 brincos"). Com `mes`, o `periodo` e as datas sao ignorados. Para UM outubro especifico — "outubro de 2025" — use `de` e `ate` em vez deste campo.',
      },
      limite: {
        type: 'number',
        description:
          'Quantas vendedoras listar. Padrao 10. Com `mes`, e quantas POR ANO, e o padrao e 1 — so a campea de cada ano.',
      },
      ...DATAS_LIVRES,
    },
    required: ['familia'],
  },
};

/**
 * OS COMBINADOS — ANA-16 e ANA-18, 28/09/2026.
 *
 * ==========================================================================
 * "GUARDAR" E O VERBO, E ELE E DELIBERADO.
 *
 * Nao e "criar alerta" nem "configurar aviso": a agente guarda e LEMBRA, e nao
 * dispara sozinha. Chamar a ferramenta de alerta faria o modelo prometer o que
 * ela nao faz — e quem combinasse "me avise as 8h" esperaria o telefone tocar.
 *
 * A descricao diz isso com todas as letras porque e a unica coisa que o modelo
 * le antes de decidir usar.
 * ==========================================================================
 */
const GUARDAR_COMBINADO_TOOL: Anthropic.Tool = {
  name: 'guardar_combinado',
  description:
    'Guarda uma instrucao que a equipe combinou com voce, para nao esquecer entre conversas nem depois de o sistema reiniciar. Use quando disserem "de agora em diante...", "sempre que...", "lembre que...", "combinado: ...". VOCE GUARDA E LEMBRA — nao passa a avisar ninguem sozinha, porque voce so age quando alguem escreve. Se o combinado for um aviso automatico, guarde e diga isso.',
  input_schema: {
    type: 'object',
    properties: {
      texto: {
        type: 'string',
        description:
          'O combinado, na forma mais curta que preserve o sentido. Ate 300 caracteres. Escreva do jeito que a pessoa reconheceria depois — e o texto que ela vai ver quando pedir a lista.',
      },
    },
    required: ['texto'],
  },
};

const LISTAR_COMBINADOS_TOOL: Anthropic.Tool = {
  name: 'listar_combinados',
  description:
    'Lista o que ja foi combinado com voce, numerado. Use quando perguntarem "o que voce lembra?", "quais combinados a gente tem?", "o que eu ja te pedi?" — e SEMPRE antes de esquecer algum, porque o numero para esquecer vem desta lista.',
  input_schema: { type: 'object', properties: {} },
};

const ESQUECER_COMBINADO_TOOL: Anthropic.Tool = {
  name: 'esquecer_combinado',
  description:
    'Desfaz um combinado, pelo numero que apareceu em `listar_combinados`. Use quando pedirem "esquece aquilo", "pode tirar o segundo", "nao precisa mais me avisar disso". CHAME `listar_combinados` ANTES se voce nao acabou de mostrar a lista — o numero e a posicao nela, e chutar apaga o combinado errado.',
  input_schema: {
    type: 'object',
    properties: {
      numero: {
        type: 'number',
        description: 'A posicao na lista, comecando em 1.',
      },
    },
    required: ['numero'],
  },
};

/**
 * ==========================================================================
 * OS LEMBRETES PESSOAIS — 30/09/2026.
 *
 * A DESCRICAO PRECISA SEPARAR LEMBRETE DE COMBINADO, porque a agente
 * confundia os dois. Em 30/09 pediram "me lembra de falar com as vendedoras
 * daqui a 20 minutos" e ela ofereceu guardar um COMBINADO — que e regra
 * permanente e so faria ela repetir a frase quando a pessoa voltasse.
 *
 *   combinado — vale SEMPRE, em toda conversa, ate mandarem esquecer
 *   lembrete  — toca UMA vez, na hora marcada, e vai atras da pessoa
 *
 * A persona tem uma linha dizendo o mesmo. As duas existem porque a descricao
 * da ferramenta e o que o modelo le na hora de ESCOLHER, e a persona e o que
 * ele leu antes de comecar.
 * ==========================================================================
 */
const GUARDAR_LEMBRETE_TOOL: Anthropic.Tool = {
  name: 'guardar_lembrete',
  description:
    'Guarda um lembrete PESSOAL de quem esta falando com voce, e voce manda a mensagem na hora marcada. Use para "me lembra amanha de...", "me avisa as 15h que...", "nao me deixa esquecer de...". VOCE VAI MANDAR SOZINHA na hora — isto nao e combinado, que so vale quando a pessoa volta a perguntar. O lembrete e so dela: ninguem mais ve nem recebe. Serve para qualquer assunto, de trabalho ou nao.',
  input_schema: {
    type: 'object',
    properties: {
      texto: {
        type: 'string',
        description:
          'O que lembrar, nas palavras DELA. Ate 400 caracteres. Nao reescreva em linguagem formal — ela vai receber isto de volta e precisa reconhecer.',
      },
      quandoIso: {
        type: 'string',
        description:
          'Quando avisar, em ISO 8601 com fuso (ex.: 2026-10-01T09:00:00-03:00), calculado a partir da data e hora de hoje informadas acima. Se ela nao disser a HORA, PERGUNTE antes de chamar — nunca escolha uma.',
      },
    },
    required: ['texto', 'quandoIso'],
  },
};

const MEUS_LEMBRETES_TOOL: Anthropic.Tool = {
  name: 'meus_lembretes',
  description:
    'Lista os lembretes que a pessoa falando com voce tem guardados, numerados e com a hora de cada um. Use para "quais meus lembretes?", "o que eu tenho marcado?" — e sempre que precisar do numero para remarcar ou cancelar. So aparecem os dela.',
  input_schema: { type: 'object', properties: {} },
};

const REMARCAR_LEMBRETE_TOOL: Anthropic.Tool = {
  name: 'remarcar_lembrete',
  description:
    'Muda a hora de um lembrete que ela ja guardou. Use para "adia aquele da Faby para sexta", "muda o horario do lembrete das 9". Se mais de um lembrete casar com o que ela disse, a ferramenta NAO escolhe: devolve a lista para voce perguntar qual.',
  input_schema: {
    type: 'object',
    properties: {
      qual: {
        type: 'string',
        description:
          'Qual lembrete: um trecho do texto dele ("o da Faby") ou a POSICAO na lista de meus_lembretes ("2"). Prefira o trecho de texto quando ela disse do que se trata.',
      },
      quandoIso: {
        type: 'string',
        description:
          'A nova hora, em ISO 8601 com fuso. Se ela nao disser a hora, PERGUNTE — nunca escolha uma.',
      },
    },
    required: ['qual', 'quandoIso'],
  },
};

const CANCELAR_LEMBRETE_TOOL: Anthropic.Tool = {
  name: 'cancelar_lembrete',
  description:
    'Cancela um lembrete dela, que entao nao toca mais. Use para "pode tirar aquele do bolo", "cancela o lembrete de sexta", "nao precisa mais me avisar disso". Se mais de um casar, a ferramenta devolve a lista em vez de escolher — pergunte qual.',
  input_schema: {
    type: 'object',
    properties: {
      qual: {
        type: 'string',
        description:
          'Qual lembrete: um trecho do texto dele ou a POSICAO na lista de meus_lembretes.',
      },
    },
    required: ['qual'],
  },
};

const GESTAO_CARTEIRA_TOOL: Anthropic.Tool = {
  name: 'carteira_de_vendedora',
  description:
    'Lista os clientes DA CARTEIRA de uma vendedora que estao ha tempo sem comprar, do mais parado para o menos, e diz QUANTOS existem no total. Use para "quem esta parado na carteira do Thiago", "quem a Marina deveria procurar". Inclui quem nunca comprou. A lista vem CURTA de proposito — se houver mais, diga o total e ofereca refinar ou procurar um cliente especifico.',
  input_schema: {
    type: 'object',
    properties: {
      vendedora: {
        type: 'string',
        description: 'Nome da vendedora, como falado.',
      },
      meses: {
        type: 'integer',
        description: 'Quantos meses sem comprar. Omita para usar 6.',
      },
    },
    required: ['vendedora'],
  },
};

const GESTAO_MELHORES_TOOL: Anthropic.Tool = {
  name: 'melhores_da_vendedora',
  description:
    'Lista os clientes DA CARTEIRA de uma vendedora que mais compraram, do maior para o menor, e diz quantos compraram no total. Sem categoria conta COMPRAS; com categoria conta PECAS daquele tipo ("quem comprou mais aneis com a Marina"). A lista vem curta — havendo mais, diga o total e ofereca refinar.',
  input_schema: {
    type: 'object',
    properties: {
      vendedora: {
        type: 'string',
        description: 'Nome da vendedora, como falado.',
      },
      categoria: {
        type: 'string',
        description:
          'Categoria da peca, no singular: "Anel", "Colar", "Brinco", "Pulseira", "Pingente", "Alianca". Omita para contar todas as compras.',
      },
      ultimos_meses: {
        type: 'integer',
        description:
          'Recorte de periodo, em meses. Omita para o historico inteiro.',
      },
    },
    required: ['vendedora'],
  },
};

const GESTAO_LEADS_TOOL: Anthropic.Tool = {
  name: 'listar_leads',
  description:
    'Lista os LEADS que terminaram a triagem e ainda esperam ser encaminhados a uma vendedora, com o que cada um procura e ha quanto tempo espera. Use para "que leads estao esperando", "tem lead pendente?", "o que ficou para encaminhar". Nao traz telefone.',
  input_schema: {
    type: 'object' as const,
    properties: {},
  },
};

const GESTAO_VENDEDORAS_TOOL: Anthropic.Tool = {
  name: 'listar_vendedoras',
  description:
    'Lista as vendedoras ATIVAS da equipe — a lista JA VEM FILTRADA, entao diga "vendedoras ativas" e nunca apresente o numero como se fosse o cadastro inteiro. Traz, de cada uma, a disponibilidade, as especialidades e SE O CELULAR DELA ESTA CONECTADO ao sistema. A primeira linha da resposta e o resumo (quantas ativas, quantas conectadas): repasse-o. ESTAR ATIVA NO CADASTRO E DIFERENTE DE TER O CELULAR CONECTADO — sem a conexao o sistema nao enxerga as conversas dela com cliente, e toda metrica de atendimento dela fica vazia. Quando a resposta disser que NENHUMA esta conectada, diga isso com todas as letras: e a explicacao de por que nao ha dado de atendimento. Use para "quais sao as minhas vendedoras", "quem esta disponivel", "para quem eu posso encaminhar" — e sempre que a usuaria precisar escolher uma pessoa e nao souber os nomes. Nao traz venda, meta nem telefone.',
  input_schema: {
    type: 'object' as const,
    properties: {},
  },
};

const GESTAO_ENCAMINHAR_LEAD_TOOL: Anthropic.Tool = {
  name: 'encaminhar_lead',
  description:
    'Encaminha para uma vendedora um LEAD que terminou a triagem — a resposta ao aviso "Chegou um lead novo... para qual vendedora encaminho?". Use quando a usuaria disser para quem mandar: "manda pro Thiago", "encaminha a Marina para a Cintia". Passe o nome da vendedora como ela falou; o nome do lead so se ela disser qual, porque com um unico lead esperando o sistema ja sabe de quem se trata. ISTO E PARA LEAD, nao para cliente da casa: cliente com carteira usa avisar_vendedora.',
  input_schema: {
    type: 'object' as const,
    properties: {
      vendedora: {
        type: 'string',
        description: 'Nome da vendedora, como a usuaria falou.',
      },
      lead: {
        type: 'string',
        description:
          'Nome do lead, quando a usuaria disser qual. Omita se ela nao disse.',
      },
      quando: {
        type: 'string',
        description:
          'Horario combinado, COMO A USUARIA FALOU: "hoje as 14h", "amanha de manha". Vai como recado para a vendedora — NAO agenda nem cobra nada. Omita se ela nao mencionou horario; nunca invente um.',
      },
    },
    required: ['vendedora'],
  },
};

const GESTAO_CARTEIRA_CLIENTE_TOOL: Anthropic.Tool = {
  name: 'de_quem_e_o_cliente',
  description:
    'Diz em qual carteira um cliente esta, ou seja, de qual vendedora ele e. Use para "de quem e a Renata Gomes", "quem atende esse cliente". Esta informacao e exclusiva da administracao.',
  input_schema: {
    type: 'object',
    properties: {
      cliente: { type: 'string', description: 'Nome do cliente, como falado.' },
    },
    required: ['cliente'],
  },
};

/**
 * `AAAA-MM-DD` — a data que o modelo manda, conferida antes de virar consulta.
 *
 * ==========================================================================
 * CONSTANTE COM NOME, E NAO LITERAL EMBUTIDO, PORQUE ELA JA ESTEVE ERRADA.
 *
 * Ate 29/09/2026 o teste era `/^d{4}-d{2}-d{2}$/` — as barras do `\d` tinham
 * sumido. Aquilo casa com o texto literal "dddd-dd-dd" e com data nenhuma:
 * TODA data pedida caia no `undefined` EM SILENCIO e virava hoje. Perguntar
 * "como foi o dia da Aline no dia 25?" devolvia os numeros de HOJE, sem aviso
 * de que a data tinha sido ignorada — a pior forma de errar, porque a resposta
 * parece certa.
 *
 * Um literal enfiado no meio de uma chamada nao tem como ser testado; uma
 * constante exportada tem, e o teste esta em `data-iso.spec.ts`.
 * ==========================================================================
 */
export const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const GESTAO_DIA_DA_VENDEDORA_TOOL: Anthropic.Tool = {
  name: 'dia_da_vendedora',
  description:
    'O DIA DE UMA VENDEDORA num resumo: com quantas PESSOAS ela falou pelo WhatsApp — clientes cadastradas E numeros que o sistema ainda nao identificou —, quantas escreveram e ainda nao foram respondidas, os contatos que ela marcou e para que horas, o que vendeu, o que fechou e o que venceu sem resposta. Use para "como esta o canal da Marina", "como foi o dia da Bianca", "a Renata falou com alguem hoje". DUAS ATENCOES: (1) isto NAO le o texto das conversas dela — os numeros sao exatos, mas nao ha como dizer O QUE a pessoa quer, entao nao invente conteudo de conversa; (2) numero "ainda NAO identificado" NAO pode ser chamado de cliente: repasse como esta. Para saber quem esta conversando NESTE MOMENTO, use conversas_agora.',
  input_schema: {
    type: 'object',
    properties: {
      vendedora: {
        type: 'string',
        description: 'Nome da vendedora, como falado.',
      },
      dia: {
        type: 'string',
        description:
          'Dia no formato AAAA-MM-DD. Omita para hoje. Nao recua sozinho para um dia com movimento: dia parado responde "nada".',
      },
    },
    required: ['vendedora'],
  },
};

/**
 * A DESCRICAO PRECISA DISPUTAR COM O `dia_da_vendedora` — 29/09/2026.
 *
 * As duas respondem a frases parecidas ("a Aline esta com algum cliente?") e o
 * modelo escolhe pela descricao. A diferenca que importa esta na primeira
 * linha de cada uma: esta e AGORA, aquela e O DIA — e o dia leva uma hora para
 * existir, porque so o leitor o escreve.
 */
const GESTAO_CONVERSAS_AGORA_TOOL: Anthropic.Tool = {
  name: 'conversas_agora',
  description:
    'QUEM ESTA CONVERSANDO NESTE MOMENTO no WhatsApp corporativo, ao vivo. Use SEMPRE que a pergunta for sobre o presente: "a Aline esta com algum cliente", "quem esta atendendo agora", "tem alguem conversando", "a Marina esta ocupada". COM "vendedora", so o celular dela; SEM, a loja inteira. IMPORTANTE: esta e a UNICA ferramenta que enxerga a conversa enquanto ela acontece — todas as outras (dia_da_vendedora, funil_de_atendimentos, metricas_de_atendimento) so enxergam depois que o sistema le a conversa, o que acontece uma hora DEPOIS da ultima mensagem. Entao se aqui aparece conversa e la nao aparece nada, NAO ha defeito nenhum: a leitura ainda nao rodou, e e isso que voce deve explicar. LIMITES: nao diz o assunto da conversa (isto e ponteiro, nao texto) e nao afirma que um numero ainda nao identificado e cliente — repasse "nao identificado" como esta.',
  input_schema: {
    type: 'object',
    properties: {
      vendedora: {
        type: 'string',
        description:
          'Nome da vendedora, como falado. OMITA para a loja inteira — nao invente um nome quando a pergunta for geral.',
      },
      minutos: {
        type: 'number',
        description:
          'Quanto tempo atras ainda conta como "agora". Omita para 30 minutos. Use apenas se pedirem outra janela ("na ultima hora" = 60).',
      },
    },
  },
};

const GESTAO_PANORAMA_LEADS_TOOL: Anthropic.Tool = {
  name: 'panorama_de_leads',
  description:
    'A fila de leads da triagem. SEM "vendedora": quantos em cada estado, quem esta esperando encaminhamento (com nome e telefone) e quantos leads foram para cada vendedora. COM "vendedora": TODOS os leads que foram encaminhados para ela — os que ainda estao abertos E os que ela ja resolveu —, cada um com nome, telefone, o que procura, a ocasiao, EM QUE PE ESTA (ainda sem contato, em contato, virou cliente, nao vingou) e a ULTIMA ANOTACAO que ela escreveu. Use quando perguntarem "como estao os leads", "quantos leads a Marina recebeu", "tem lead esperando", "me passa o contato dos leads dela" e TAMBEM para "ela deu baixa em algum lead", "o que aconteceu com os leads dela", "como foi com aquele lead", "algum lead virou cliente". A baixa de lead esta AQUI — nao confunda com atendimento fechado, que e outra coisa e sai no funil. Para encaminhar um lead, use encaminhar_lead.',
  input_schema: {
    type: 'object',
    properties: {
      vendedora: {
        type: 'string',
        description:
          'Nome da vendedora, como falado. OMITA para a fila inteira — nao invente um nome quando a pergunta for geral.',
      },
    },
  },
};

/**
 * AS METRICAS DE ATENDIMENTO — ANA-08 a ANA-12, 29/09/2026.
 *
 * ==========================================================================
 * A DESCRICAO DIZ O QUE ELA *NAO* RESPONDE, E ISSO E METADE DO TRABALHO.
 *
 * "Tempo", "media" e "quantos" sao palavras que aparecem em perguntas de
 * VENDA tambem. Sem a fronteira escrita, o modelo chamaria esta ferramenta
 * para "qual o ticket medio" e responderia com numero de atendimento — que e
 * plausivel, errado, e ninguem confere.
 * ==========================================================================
 */
const GESTAO_METRICAS_TOOL: Anthropic.Tool = {
  name: 'metricas_de_atendimento',
  description:
    'Como a equipe ATENDE: tempo medio ate a primeira resposta, duracao media do atendimento, tempo medio ate fechar a venda, quantos leads cada vendedora recebeu e quantas interacoes cada uma registrou. Use para "quanto tempo demoramos para responder", "a equipe esta respondendo rapido", "quanto tempo leva um atendimento", "quantos leads a Marina recebeu", "quem mais interage com cliente", "como foi o atendimento este mes". NAO responde faturamento, ticket medio, quantas pecas foram vendidas nem quem vendeu mais — isso e venda, e sai nas ferramentas de venda. TODA media vem com o TAMANHO DA AMOSTRA junto: repasse esse numero sempre, porque a base ainda e pequena e uma media de dois casos nao e um indicador. Quando vier "sem nenhum caso no periodo", diga exatamente isso — nao invente que foi rapido nem que foi zero.',
  input_schema: {
    type: 'object',
    properties: {
      ...DATAS_LIVRES,
      periodo: {
        type: 'string',
        enum: ['HOJE', 'ONTEM', 'SEMANA', 'MES', 'ANO'],
        description:
          'O atalho, quando nao houver datas. Padrao MES — em HOJE a media quase sempre sai de zero casos e nao diz nada.',
      },
    },
  },
};

/**
 * OS CINCO RANKINGS — ANA-14, 29/09/2026.
 *
 * O `eixo` e o que separa "quem responde mais rapido" (uma linha) de "como
 * esta a equipe" (cinco). Sem ele o modelo devolveria os cinco rankings para
 * uma pergunta que queria um nome.
 */
const GESTAO_RANKINGS_TOOL: Anthropic.Tool = {
  name: 'rankings_de_atendimento',
  description:
    'Quem e a melhor da equipe em CADA aspecto do atendimento: quem responde mais rapido, quem fecha venda em menos tempo, quem mais interage com cliente, quem mais converte lead em venda e quem recebe mais leads. Use para "quem responde mais rapido", "qual vendedora converte melhor", "quem recebe mais lead", "quem atende melhor", "ranking da equipe". NAO responde quem vendeu mais em dinheiro nem quem vendeu mais pecas — isso e venda, e sai nas ferramentas de venda. O tempo de resposta vem no RELOGIO DA LOJA (08h-19h) com o tempo corrido ao lado: repasse os dois quando houver diferenca, porque a diferenca significa que a cliente escreveu fora do horario. Toda posicao vem com o numero de casos: repasse sempre, e quando a resposta disser que alguem ficou de fora por ter poucos casos, diga isso tambem — nao e que ela nao atendeu.',
  input_schema: {
    type: 'object',
    properties: {
      eixo: {
        type: 'string',
        enum: ['RESPOSTA', 'FECHAMENTO', 'INTERACOES', 'CONVERSAO', 'LEADS'],
        description:
          'Qual ranking. OMITA so quando a pergunta for geral ("como esta a equipe") — para uma pergunta especifica, escolha o eixo e devolva uma linha.',
      },
      ...DATAS_LIVRES,
      periodo: {
        type: 'string',
        enum: ['HOJE', 'ONTEM', 'SEMANA', 'MES', 'ANO'],
        description: 'O atalho, quando nao houver datas. Padrao MES.',
      },
    },
  },
};

/**
 * A ANALISE DE TOM — ANA-15, 29/09/2026.
 *
 * A DESCRICAO AVISA DO LIMITE PORQUE ELE E INVISIVEL. A ferramenta le do
 * celular da vendedora na hora, e conversa antiga sai do aparelho: "esta
 * semana" responde, "marco" nao. Sem esse aviso o modelo trataria um
 * "nao encontrei" como "nao houve conversa".
 */
const GESTAO_TOM_TOOL: Anthropic.Tool = {
  name: 'tom_da_conversa',
  description:
    'Como foi o TOM de uma vendedora com uma cliente especifica: atenciosa, seca, apressada, se respondeu o que perguntaram. Use para "como a Marina falou com a dona Cida", "o atendimento dela foi bom", "ela tratou bem essa cliente". EXIGE as duas: o nome da vendedora E o nome da cliente — sem a cliente nao da para responder, e voce deve PERGUNTAR qual em vez de escolher uma. Le a conversa no celular da vendedora NA HORA: so funciona se o numero dela estiver conectado, e so alcanca conversa recente, porque mensagem antiga sai do aparelho e nao fica guardada aqui. Quando a resposta disser isso, repasse — nao conclua que nao houve atendimento. NAO serve para comparar vendedoras nem para ranquear: para isso use rankings_de_atendimento.',
  input_schema: {
    type: 'object',
    properties: {
      vendedora: { type: 'string', description: 'Nome da vendedora, como falado.' },
      cliente: { type: 'string', description: 'Nome da cliente, como falado.' },
    },
    required: ['vendedora', 'cliente'],
  },
};

/**
 * COMPARAR COM OUTROS ANOS — 29/09/2026.
 *
 * A DESCRICAO INSISTE NO CORTE PORQUE ELE E A PARTE QUE ENGANA. Quando o mes
 * ainda corre, a resposta compara ate o MESMO DIA em todos os anos — e traz o
 * mes fechado dos anos passados ao lado. Repassar so um dos dois numeros da
 * uma leitura errada da operacao.
 */
const GESTAO_COMPARAR_ANOS_TOOL: Anthropic.Tool = {
  name: 'comparar_com_outros_anos',
  description:
    'Compara o MESMO recorte atraves dos anos: "como esta setembro comparado aos outros anos", "esse mes foi melhor que ano passado", "como foi esse periodo em 2024". Devolve, por ano: receita, numero de vendas e ticket medio. A base tem de 2023 em diante. Quando o mes ainda esta correndo, a comparacao e CORTADA NO MESMO DIA em todos os anos — repasse isso, porque comparar mes parcial com mes inteiro faz o ano atual sempre parecer pior. Nesses casos vem tambem o MES FECHADO dos anos anteriores: diga os dois ("ate o dia 29 estamos X% abaixo; setembro passado fechou em Y"). Use `mes` para um mes inteiro, ou `de`/`ate` para um intervalo de dias que se repete em cada ano. Sem `vendedora`, e a loja.',
  input_schema: {
    type: 'object',
    properties: {
      mes: {
        type: 'integer',
        minimum: 1,
        maximum: 12,
        description: 'O mes, de 1 a 12. Use quando a pergunta for sobre um mes.',
      },
      ...DATAS_LIVRES,
      vendedora: {
        type: 'string',
        description: 'Nome da vendedora, como falado. OMITA para a loja inteira.',
      },
    },
  },
};

/**
 * COMPARAR COM O PERIODO ANTERIOR — 29/09/2026.
 *
 * A DESCRICAO PRECISA SEPARAR ESTA DE `comparar_com_outros_anos`, porque as
 * duas respondem "comparado com o que?" e a escolha errada devolve um numero
 * plausivel para outra pergunta.
 */
const GESTAO_COMPARAR_ANTERIOR_TOOL: Anthropic.Tool = {
  name: 'comparar_com_periodo_anterior',
  description:
    'Compara o periodo ATUAL com o IMEDIATAMENTE ANTERIOR: esta semana contra a semana passada, este mes contra o mes passado, este ano contra o ano passado. Traz CLIENTES DISTINTOS, numero de vendas, receita e ticket dos dois lados. Use para "quantos clientes tive essa semana e em relacao a semana passada", "esse mes foi melhor que o passado", "estamos crescendo". NAO confunda com comparar_com_outros_anos, que compara o MESMO mes em ANOS diferentes (setembro/2026 contra setembro/2025) — aqui e sempre contra o periodo logo antes. CLIENTES e VENDAS sao numeros diferentes: a mesma cliente comprando tres vezes conta 1 cliente e 3 vendas; repasse o que perguntaram. Quando o periodo atual ainda esta correndo (mes ou ano), o anterior vem CORTADO NO MESMO PONTO e o total fechado dele vem junto: diga os dois, porque comparar periodo parcial com periodo inteiro faz o atual parecer pior sempre.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: {
        type: 'string',
        enum: ['SEMANA', 'MES', 'ANO'],
        description:
          'SEMANA sao sete dias contando hoje (os dois lados cheios, sem corte). MES e ANO sao do calendario, e o atual esta correndo.',
      },
      ...DATAS_LIVRES,
      vendedora: {
        type: 'string',
        description: 'Nome da vendedora. OMITA para a loja inteira.',
      },
    },
  },
};

const GESTAO_FUNIL_TOOL: Anthropic.Tool = {
  name: 'funil_de_atendimentos',
  description:
    'Como estao os atendimentos EM CURSO agora, por etapa: em negociacao, remarcado, sem conseguir falar, primeiro contato. SEM "vendedora", traz a loja inteira mais uma linha por vendedora. COM "vendedora", traz so a carteira dela. Use quando perguntarem "como esta o funil", "quantos clientes em negociacao", "o que esta parado", "como esta a carteira da Marina", "quantos atendimentos abertos temos". E o estado de AGORA, nao um periodo — nao diga "hoje" nem "esta semana" ao repassar. Nao traz venda nem valor: para dinheiro use as ferramentas de vendas.',
  input_schema: {
    type: 'object',
    properties: {
      vendedora: {
        type: 'string',
        description:
          'Nome da vendedora, como falado. OMITA para a loja inteira — nao invente um nome quando a pergunta for geral.',
      },
    },
  },
};

const GESTAO_FEEDBACKS_TOOL: Anthropic.Tool = {
  name: 'feedbacks_de_vendedora',
  description:
    'Mostra O QUE A VENDEDORA CONTOU sobre os atendimentos dela, nas palavras dela. Use para "qual foi o feedback do Thiago hoje", "o que a Marina disse do atendimento", "como foi com a Luana". Passando o nome do CLIENTE, traz o episodio daquele cliente; sem ele, traz os ultimos feedbacks dela no periodo. Esta informacao e exclusiva da administracao.',
  input_schema: {
    type: 'object',
    properties: {
      vendedora: {
        type: 'string',
        description: 'Nome da vendedora, como falado.',
      },
      cliente: {
        type: 'string',
        description:
          'Nome do cliente, quando a pergunta for sobre UM atendimento especifico. Omita para ver os ultimos feedbacks dela.',
      },
      dias: {
        type: 'number',
        description:
          'Janela em dias. Hoje = 1, esta semana = 7. Omita para os ultimos sete dias.',
      },
    },
    required: ['vendedora'],
  },
};

const GESTAO_AGENDAR_TOOL: Anthropic.Tool = {
  name: 'agendar_para_vendedora',
  description:
    'Marca um contato na agenda de uma vendedora, com um CLIENTE CADASTRADO — nunca com um nome que veio de panorama_de_leads, porque lead nao tem cadastro de cliente e a chamada vai falhar. Use quando pedirem para agendar alguem — "agenda a Luana com a Cintia amanha as 15h". Se o cliente for da carteira de OUTRA vendedora, a ferramenta NAO agenda: devolve a pergunta a ser feita, voce repassa e espera a escolha. Depois que a pessoa responder, chame de novo com os MESMOS cliente, vendedora e horario, agora com o `modo`. NUNCA escolha o modo por conta propria — transferir muda a carteira do cliente para sempre.',
  input_schema: {
    type: 'object',
    properties: {
      cliente: {
        type: 'string',
        description:
          'Nome do cliente, como falado — ou o CODIGO dele, quando a ferramenta ja tiver pedido para desempatar homonimos.',
      },
      vendedora: {
        type: 'string',
        description: 'Nome da vendedora que vai atender.',
      },
      quandoIso: {
        type: 'string',
        description:
          'Data e hora combinadas, em ISO 8601 com fuso (ex.: 2026-08-22T15:00:00-03:00). Se nao disserem o horario, PERGUNTE antes de chamar — nunca escolha um.',
      },
      modo: {
        type: 'string',
        enum: ['OCASIONAL', 'TRANSFERIR'],
        description:
          'So na SEGUNDA chamada, depois de a pessoa responder sobre a carteira. OCASIONAL = marca o contato e o cliente CONTINUA na carteira de origem. TRANSFERIR = marca e MOVE o cliente para a carteira da nova vendedora, valendo dali em diante para tudo. Omita na primeira chamada.',
      },
    },
    required: ['cliente', 'vendedora', 'quandoIso'],
  },
};

const AGENDAR_TOOL: Anthropic.Tool = {
  name: 'agendar_contato',
  description:
    'Coloca um contato com um cliente na agenda DELA, e agenda o lembrete. Use quando ela pedir para marcar, lembrar ou agendar — "me lembra de ligar pra Renata amanha as 10", "marca a Carla pra sexta as 15h". So funciona com cliente da carteira dela — NUNCA chame com um nome que veio de meus_leads: lead nao tem cadastro de cliente e a chamada vai falhar. Preencha quandoIso SEMPRE em ISO 8601 com fuso, calculado a partir da data de hoje informada acima. Se ela nao disser um horario, PERGUNTE antes de chamar — nao invente.',
  input_schema: {
    type: 'object',
    properties: {
      cliente: {
        type: 'string',
        description:
          'Nome do cliente como ela escreveu. Nao complete nem corrija o sobrenome.',
      },
      quandoIso: {
        type: 'string',
        description:
          'O horario combinado em ISO 8601 com fuso, ex.: "2026-08-21T10:00:00-03:00".',
      },
    },
    required: ['cliente', 'quandoIso'],
  },
};

const RELATO_TOOL: Anthropic.Tool = {
  name: 'registrar_relato',
  description:
    'Registra o que a vendedora acabou de contar sobre o contato dela com o cliente que esta pendente. Use quando a mensagem dela responder "como foi com o cliente" — se falou, se nao conseguiu falar, se o cliente pediu para remarcar, se fechou venda ou desistiu. NAO use para outros assuntos: pergunta sobre agenda, sobre numeros, ou conversa solta nao sao relato. Voce nao precisa passar nada: o sistema le a mensagem original dela.',
  input_schema: { type: 'object', properties: {} },
};

const AVISAR_TOOL: Anthropic.Tool = {
  name: 'avisar_vendedora',
  description:
    'Avisa pelo WhatsApp a vendedora responsavel por um cliente de que ele pediu atendimento. Use quando a usuaria disser algo como "o cliente Henrique quer atendimento, avise a vendedora dele". Voce NAO escolhe a vendedora: o sistema descobre quem e a partir da carteira do cliente. Passe apenas o nome do cliente como a usuaria falou, e o assunto e o horario se ela mencionar.',
  input_schema: {
    type: 'object',
    properties: {
      cliente: {
        type: 'string',
        description:
          'Nome do cliente como a usuaria escreveu. Nao invente sobrenome nem complete o nome.',
      },
      assunto: {
        type: 'string',
        description:
          'O que o cliente procura, em poucas palavras (ex.: "colar de safira"). Omita se a usuaria nao disser.',
      },
      quando: {
        type: 'string',
        description:
          'Horario ou momento combinado, nas palavras da usuaria (ex.: "hoje no fim da tarde"). Omita se ela nao disser.',
      },
      quando_iso: {
        type: 'string',
        description:
          'O MESMO horario em ISO 8601 com fuso (ex.: "2026-08-19T17:00:00-03:00"), calculado a partir da data de hoje informada no system prompt. E o que permite agendar a cobranca. Preencha SEMPRE que houver um horario identificavel; omita se a usuaria falou algo vago como "mais tarde".',
      },
      ocasiao: {
        type: 'string',
        enum: [
          'CASAMENTO',
          'NOIVADO',
          'ANIVERSARIO',
          'FORMATURA',
          'DATA_COMEMORATIVA',
          'AUTOPRESENTE',
          'OUTRO',
        ],
        description:
          'Para qual acontecimento o cliente procura a peca, se a usuaria disser. Nao adivinhe: omita quando ela nao mencionar.',
      },
    },
    required: ['cliente'],
  },
};

interface AvisarToolInput {
  cliente?: unknown;
  assunto?: unknown;
  quando?: unknown;
  quando_iso?: unknown;
  ocasiao?: unknown;
}

// Tetos defensivos para o que vem do modelo e entra no texto enviado a
// vendedora — o `assunto` e o `quando` sao os unicos trechos originados na
// conversa, e uma mensagem de WhatsApp nao tem por que ser longa.
const AVISO_CLIENTE_MAX = 120;
const AVISO_TRECHO_MAX = 160;

interface DemandaToolInput {
  tipo: 'RELATORIO' | 'AJUSTE' | 'DUVIDA' | 'OUTRO';
  descricao: string;
}

// Limite defensivo para a descricao vinda do modelo (espelha o MaxLength do DTO).
const DEMANDA_DESCRICAO_MAX = 4000;

/**
 * Quantas voltas de ferramenta um turno pode dar.
 *
 * ==========================================================================
 * CINCO PORQUE O CUSTO E LINEAR E O SILENCIO ERA TOTAL.
 *
 * Cada volta e uma chamada ao modelo, entao teto alto transforma pergunta mal
 * formulada em conta cara. Mas teto baixo corta pergunta legitima: "e das
 * outras vendedoras?" precisa de duas voltas — uma para saber quem sao, outra
 * para as agendas delas.
 *
 * Cinco cobre com folga o que apareceu na pratica (nenhuma pergunta real
 * passou de tres) e para antes de a conta doer. E o numero nao e o que
 * importa: e que estourar o teto NAO descarta pedido calado, como acontecia
 * — obriga o modelo a responder com o que ja tem.
 * ==========================================================================
 */
const MAX_VOLTAS = 5;

/**
 * As travas de ESCRITA, que valem para o TURNO e nao para a volta.
 *
 * Elas existem contra criacao em massa — inclusive por injecao no texto que um
 * cliente escreveu. Se nascessem a cada volta, um turno de cinco voltas daria
 * cinco demandas, cinco avisos e cinco agendamentos, e a trava viraria enfeite.
 * Por isso viajam por fora do despacho, e nao dentro dele.
 */
interface TetosPorTurno {
  demandaRegistrada: boolean;
  avisoEnviado: boolean;
  contatoAgendado: boolean;
  relatoGravado: boolean;
  /**
   * Um lembrete por turno.
   *
   * Remarcar e cancelar NAO entram: os dois mexem em linha que ja existe, e
   * quem pede "adia esses dois" merece que os dois sejam adiados. Guardar e
   * que cria, e e por onde um laco viraria fila.
   */
  lembreteGuardado: boolean;
}

/**
 * Os erros que NAO passam sozinhos — ver `executarLeitura`.
 *
 * `QueryFailedError` e do TypeORM e cobre o caso que motivou isto: SQL
 * malformado. Os outros tres sao defeito de codigo puro. Tudo o mais — rede,
 * timeout, WAHA fora do ar, limite da API — e tratado como passageiro, que e
 * o lado seguro de errar: mandar tentar de novo algo que era defeito custa
 * uma tentativa; dizer "esta quebrado" sobre um timeout assusta a toa.
 */
const ERROS_DE_DEFEITO = new Set([
  'QueryFailedError',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
]);

function ehDefeitoDeCodigo(err: unknown): boolean {
  return err instanceof Error && ERROS_DE_DEFEITO.has(err.name);
}

@Injectable()
export class AnthropicClient implements ILlmClient {
  private readonly logger = new Logger(AnthropicClient.name);
  private readonly client: Anthropic;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    // O SDK aceita apiKey vazia na construcao; falha so no request. Logamos
    // para deixar claro em ambiente sem chave (dev) que os agentes nao operam.
    if (!apiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY ausente — agentes nao conseguirao responder.',
      );
    }
    this.client = new Anthropic({ apiKey: apiKey ?? '' });
  }

  async chat(params: ChatParams): Promise<ChatResultado> {
    const resp = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: this.toApiMessages(params.mensagens),
    });
    return { texto: this.extrairTexto(resp), tokens: resp.usage.output_tokens };
  }

  async chatComFerramentas(
    params: ChatParams,
  ): Promise<ChatComFerramentasResultado> {
    const apiMessages = this.toApiMessages(params.mensagens);

    // Cada ferramenta so entra quando a aplicacao fornece o handler. O
    // grafico e a excecao historica: nasceu antes dos handlers e vale por
    // padrao, mas o canal de WhatsApp desliga (ver ChatParams.graficos).
    const tools: Anthropic.Tool[] = [];
    if (params.graficos ?? true) tools.push(CHART_TOOL);
    if (params.registrarDemanda) tools.push(DEMANDA_TOOL);
    if (params.avisarVendedora) tools.push(AVISAR_TOOL);
    if (params.consultarAgenda) tools.push(AGENDA_TOOL);
    if (params.gestaoAgenda) tools.push(GESTAO_AGENDA_TOOL);
    if (params.gestaoVendas) tools.push(GESTAO_VENDAS_TOOL);
    if (params.gestaoMetas) tools.push(GESTAO_METAS_TOOL);
    if (params.gestaoPorFamilia) tools.push(GESTAO_POR_FAMILIA_TOOL);
    if (params.guardarCombinado) tools.push(GUARDAR_COMBINADO_TOOL);
    if (params.listarCombinados) tools.push(LISTAR_COMBINADOS_TOOL);
    if (params.esquecerCombinado) tools.push(ESQUECER_COMBINADO_TOOL);
    if (params.guardarLembrete) tools.push(GUARDAR_LEMBRETE_TOOL);
    if (params.meusLembretes) tools.push(MEUS_LEMBRETES_TOOL);
    if (params.remarcarLembrete) tools.push(REMARCAR_LEMBRETE_TOOL);
    if (params.cancelarLembrete) tools.push(CANCELAR_LEMBRETE_TOOL);
    if (params.gestaoPanorama) tools.push(GESTAO_PANORAMA_TOOL);
    // Uma OU outra, nunca as duas: elas tem o mesmo `name`, e declarar as duas
    // deixaria o modelo com dois contratos para a mesma ferramenta.
    if (params.gestaoItens) {
      tools.push(
        params.gestaoItensExigeVendedora
          ? GESTAO_ITENS_DA_VENDEDORA_TOOL
          : GESTAO_ITENS_TOOL,
      );
    }
    // So quando o canal NAO e o da vendedora — os dois usam o mesmo nome.
    if (params.gestaoProdutos && !params.consultarProdutos) {
      tools.push(GESTAO_PRODUTOS_TOOL);
    }
    if (params.gestaoCarteiraDoCliente)
      tools.push(GESTAO_CARTEIRA_CLIENTE_TOOL);
    if (params.gestaoEncaminharLead) tools.push(GESTAO_ENCAMINHAR_LEAD_TOOL);
    if (params.gestaoVendedoras) tools.push(GESTAO_VENDEDORAS_TOOL);
    if (params.gestaoLeads) tools.push(GESTAO_LEADS_TOOL);
    if (params.gestaoCarteira) tools.push(GESTAO_CARTEIRA_TOOL);
    if (params.gestaoMelhores) tools.push(GESTAO_MELHORES_TOOL);
    if (params.gestaoAgendar) tools.push(GESTAO_AGENDAR_TOOL);
    if (params.gestaoFeedbacks) tools.push(GESTAO_FEEDBACKS_TOOL);
    if (params.gestaoFunil) tools.push(GESTAO_FUNIL_TOOL);
    if (params.gestaoPanoramaLeads) tools.push(GESTAO_PANORAMA_LEADS_TOOL);
    if (params.gestaoMetricas) tools.push(GESTAO_METRICAS_TOOL);
    if (params.gestaoRankings) tools.push(GESTAO_RANKINGS_TOOL);
    if (params.gestaoTom) tools.push(GESTAO_TOM_TOOL);
    if (params.gestaoCompararAnos) tools.push(GESTAO_COMPARAR_ANOS_TOOL);
    if (params.gestaoCompararAnterior) tools.push(GESTAO_COMPARAR_ANTERIOR_TOOL);
    if (params.gestaoDiaDaVendedora)
      tools.push(GESTAO_DIA_DA_VENDEDORA_TOOL);
    if (params.gestaoConversasAgora) tools.push(GESTAO_CONVERSAS_AGORA_TOOL);
    if (params.registrarRelato) tools.push(RELATO_TOOL);
    if (params.consultarVendas) tools.push(VENDAS_TOOL);
    if (params.consultarMetas) tools.push(METAS_TOOL);
    if (params.consultarProdutos) tools.push(PRODUTOS_TOOL);
    if (params.consultarCarteiraAgora) tools.push(CARTEIRA_AGORA_TOOL);
    if (params.consultarMeusLeads) tools.push(MEUS_LEADS_TOOL);
    if (params.atualizarLead) tools.push(ATUALIZAR_LEAD_TOOL);
    if (params.clientesSemComprar) tools.push(SEM_COMPRAR_TOOL);
    if (params.clientesPorEpoca) tools.push(EPOCA_TOOL);
    if (params.melhoresClientes) tools.push(MELHORES_TOOL);
    if (params.agendarContato) tools.push(AGENDAR_TOOL);

    const first = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      tools,
      messages: apiMessages,
    });

    let tokens = first.usage.output_tokens;

    // ======================================================================
    // O LACO DAVA UMA VOLTA SO, E ISSO SUMIA COM PERGUNTA ENCADEADA.
    //
    // Era: pede ferramentas -> roda -> pergunta de novo -> devolve o texto.
    // Se a SEGUNDA resposta tambem pedisse ferramentas, os pedidos eram
    // descartados em silencio, porque `extrairTexto` le so o bloco de texto.
    //
    // O Lucas viu em 29/09: "como esta a agenda da Aline hoje?" respondeu, e
    // "e das outras vendedoras?" devolveu "Vou olhar a agenda de hoje das
    // outras sete." e mais nada. O modelo tinha pedido as outras seis agendas
    // na segunda volta, e ninguem rodou.
    //
    // O sintoma engana: pergunta simples sempre funciona, entao parece
    // instabilidade em vez de desenho. E vale para toda pergunta que precisa
    // olhar duas vezes — "e da outra?", "compara com...", "e quanto ela
    // vendeu disso?".
    // ======================================================================
    const tetos: TetosPorTurno = {
      demandaRegistrada: false,
      avisoEnviado: false,
      contatoAgendado: false,
      relatoGravado: false,
      lembreteGuardado: false,
    };

    let grafico: GraficoDinamico | undefined;
    const conversa: Anthropic.MessageParam[] = [...apiMessages];
    let resp = first;

    for (let volta = 1; ; volta += 1) {
      const pedidos = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      if (pedidos.length === 0) {
        return { texto: this.extrairTexto(resp), tokens, grafico };
      }

      const rodada = await this.despachar(pedidos, params, tetos);
      // O grafico e um so por turno: o ultimo pedido vence, e nao ha
      // acumulo — a tela mostra um.
      grafico = rodada.grafico ?? grafico;

      // ====================================================================
      // O TETO NAO DESCARTA PEDIDO EM SILENCIO — foi esse o defeito.
      //
      // Na ultima volta as ferramentas continuam declaradas (a conversa ja
      // tem `tool_result` dentro, e some-las confundiria a API), mas o
      // `tool_choice: none` obriga o modelo a RESPONDER com o que ja tem.
      // Assim o turno sempre termina em texto, mesmo quando ele pediria mais.
      // ====================================================================
      const ultima = volta >= MAX_VOLTAS;
      const conteudo: Anthropic.ContentBlockParam[] = [...rodada.toolResults];
      if (ultima) {
        this.logger.warn(
          `O modelo pediu ferramentas por ${MAX_VOLTAS} voltas seguidas — ` +
            'fechando o turno com o que ja foi consultado.',
        );
        conteudo.push({
          type: 'text',
          text:
            'Pare de consultar e responda AGORA com o que ja tem em maos. Se ' +
            'faltou alguma coisa, diga o que faltou e ofereca buscar em ' +
            'seguida — NAO invente o que nao consultou.',
        });
      }

      conversa.push(
        { role: 'assistant', content: resp.content },
        { role: 'user', content: conteudo },
      );

      resp = await this.client.messages.create({
        model: params.model,
        // Era 1024 fixo, ignorando o teto de quem chamou. Quem pede 2048 para
        // a resposta tinha a continuacao — que e a resposta de verdade —
        // cortada pela metade.
        max_tokens: Math.max(params.maxTokens, 1024),
        system: params.system,
        tools,
        ...(ultima ? { tool_choice: { type: 'none' as const } } : {}),
        messages: conversa,
      });
      tokens += resp.usage.output_tokens;
    }
  }

  /**
   * Roda as ferramentas de UMA volta e devolve os `tool_result`.
   *
   * Vivia solto dentro do `chatComFerramentas` ate 29/09/2026, e por isso o
   * laco so podia dar uma volta. Virou metodo para poder ser chamado de novo.
   *
   * As travas de ESCRITA chegam por `tetos` e valem para o TURNO, nao para a
   * volta: se elas nascessem aqui, o modelo teria uma demanda, um aviso e um
   * agendamento novos a cada volta do laco — que e exatamente o que elas
   * existem para impedir.
   */
  private async despachar(
    toolUses: Anthropic.ToolUseBlock[],
    params: ChatParams,
    tetos: TetosPorTurno,
  ): Promise<{
    toolResults: Anthropic.ToolResultBlockParam[];
    grafico?: GraficoDinamico;
  }> {
    // Processa cada tool_use, acumulando o resultado (grafico) e os
    // tool_result que voltam ao modelo na volta seguinte.
    let grafico: GraficoDinamico | undefined;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      if (toolUse.name === 'gerar_grafico') {
        const input = toolUse.input as ChartToolInput;
        grafico = {
          type: input.tipo,
          title: input.titulo,
          data: input.dados,
          xKey: input.chave_x,
          yKeys: input.chaves_y.map((y) => ({
            key: y.chave,
            color: y.cor,
            label: y.rotulo,
          })),
        };
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content:
            'Gráfico gerado com sucesso e já apareceu no painel de Analytics.',
        });
      } else if (
        toolUse.name === 'registrar_demanda' &&
        params.registrarDemanda
      ) {
        if (tetos.demandaRegistrada) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content:
              'Ignorado: apenas uma demanda pode ser registrada por mensagem. Oriente a usuária a enviar as demais separadamente.',
            is_error: true,
          });
          continue;
        }
        tetos.demandaRegistrada = true;
        toolResults.push(
          await this.executarRegistrarDemanda(toolUse, params.registrarDemanda),
        );
      } else if (
        toolUse.name === 'registrar_relato' &&
        params.registrarRelato
      ) {
        if (tetos.relatoGravado) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: 'Ignorado: o relato desta mensagem ja foi registrado.',
            is_error: true,
          });
          continue;
        }
        tetos.relatoGravado = true;
        toolResults.push(
          await this.executarRegistrarRelato(toolUse, params.registrarRelato),
        );
      } else if (
        toolUse.name === 'carteira_de_vendedora' &&
        params.gestaoCarteira
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as { vendedora?: string; meses?: number };
            return textoDaLeituraDeGestao(
              await params.gestaoCarteira!({
                vendedora: String(e.vendedora ?? '').slice(0, 80),
                meses: Number(e.meses) > 0 ? Number(e.meses) : undefined,
              }),
              'cliente parado',
            );
          }),
        );
      } else if (
        toolUse.name === 'melhores_da_vendedora' &&
        params.gestaoMelhores
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              vendedora?: string;
              categoria?: string;
              ultimos_meses?: number;
            };
            return textoDaLeituraDeGestao(
              await params.gestaoMelhores!({
                vendedora: String(e.vendedora ?? '').slice(0, 80),
                categoria: e.categoria,
                ultimosMeses: e.ultimos_meses,
              }),
              'comprador',
            );
          }),
        );
      } else if (
        toolUse.name === 'agendar_para_vendedora' &&
        params.gestaoAgendar
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              cliente?: string;
              vendedora?: string;
              quandoIso?: string;
              modo?: 'OCASIONAL' | 'TRANSFERIR';
            };
            const r = await params.gestaoAgendar!({
              cliente: String(e.cliente ?? '').slice(0, 120),
              vendedora: String(e.vendedora ?? '').slice(0, 80),
              quandoIso: String(e.quandoIso ?? ''),
              modo: e.modo,
            });
            return `${r.mensagem}\n\nResponda com isso, sem alterar nomes nem horarios.`;
          }),
        );
      } else if (
        toolUse.name === 'panorama_de_leads' &&
        params.gestaoPanoramaLeads
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as { vendedora?: string };
            return textoDosLeads(
              await params.gestaoPanoramaLeads!({
                vendedora: String(e.vendedora ?? '').slice(0, 80) || undefined,
              }),
            );
          }),
        );
      } else if (
        toolUse.name === 'funil_de_atendimentos' &&
        params.gestaoFunil
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as { vendedora?: string };
            return textoDoFunil(
              await params.gestaoFunil!({
                vendedora: String(e.vendedora ?? '').slice(0, 80) || undefined,
              }),
            );
          }),
        );
      } else if (
        toolUse.name === 'agenda_de_vendedora' &&
        params.gestaoAgenda
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              vendedora?: string;
              periodo?: PeriodoAgendaLlm;
            };
            // VAZIO VIRA `undefined`, e nao string vazia: e o que distingue
            // "a agenda da Marina" de "a agenda da equipe". Com `''` o
            // handler cairia no caminho de UMA vendedora sem nome nenhum.
            const nome = String(e.vendedora ?? '').slice(0, 80);
            return textoDaLeituraDeGestao(
              await params.gestaoAgenda!({
                vendedora: nome || undefined,
                periodo: e.periodo ?? 'HOJE',
              }),
              'compromisso',
            );
          }),
        );
      } else if (
        toolUse.name === 'vendas_de_vendedora' &&
        params.gestaoVendas
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              vendedora?: string;
              periodo?: PeriodoVendasLlm;
              de?: string;
              ate?: string;
            };
            return textoDaLeituraDeGestao(
              await params.gestaoVendas!({
                vendedora: String(e.vendedora ?? '').slice(0, 80),
                // O ATALHO SO VALE SEM AS DATAS. Mandando `de` e `ate`, o
                // enum e ignorado la dentro — e por isso o padrao nao entra
                // aqui: fixar um valor faria o handler achar que houve
                // escolha de periodo quando nao houve.
                periodo: e.periodo,
                de: e.de,
                ate: e.ate,
              }),
              'venda',
            );
          }),
        );
      } else if (
        // ==================================================================
        // OS CINCO DESPACHOS DE 29/09/2026.
        //
        // Declarar a ferramenta ao modelo e LIGAR A EXECUCAO sao duas coisas,
        // e eu fiz so a primeira: as cinco apareciam na lista, o modelo as
        // chamava, e nenhum ramo respondia. O `tool_result` ia vazio e a API
        // recusava a conversa inteira com "user messages must have non-empty
        // content" — um 400 que nao diz qual ferramenta falhou.
        //
        // O teste que eu fiz chamava os handlers DIRETO, e por isso passou nos
        // cinco casos. O caminho que faltava era justamente este.
        // ==================================================================
        toolUse.name === 'metricas_de_atendimento' &&
        params.gestaoMetricas
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              de?: string;
              ate?: string;
              periodo?: PeriodoVendasLlm | 'ONTEM' | 'ANO';
            };
            return textoDeLinhas(
              await params.gestaoMetricas!({ de: e.de, ate: e.ate, periodo: e.periodo }),
              'Repasse os numeros com o TAMANHO DA AMOSTRA junto: media de dois casos nao e indicador.',
            );
          }),
        );
      } else if (
        toolUse.name === 'rankings_de_atendimento' &&
        params.gestaoRankings
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              eixo?: 'RESPOSTA' | 'FECHAMENTO' | 'INTERACOES' | 'CONVERSAO' | 'LEADS';
              de?: string;
              ate?: string;
              periodo?: PeriodoVendasLlm | 'ONTEM' | 'ANO';
            };
            return textoDeLinhas(
              await params.gestaoRankings!({
                eixo: e.eixo,
                de: e.de,
                ate: e.ate,
                periodo: e.periodo,
              }),
              'O tempo vem no relogio da loja (08h-19h) com o corrido ao lado: ' +
                'diga os dois quando diferirem, porque a diferenca significa que a ' +
                'cliente escreveu fora do horario.',
            );
          }),
        );
      } else if (
        toolUse.name === 'comparar_com_outros_anos' &&
        params.gestaoCompararAnos
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              mes?: number;
              de?: string;
              ate?: string;
              vendedora?: string;
            };
            return textoDeLinhas(
              await params.gestaoCompararAnos!({
                mes: e.mes,
                de: e.de,
                ate: e.ate,
                vendedora: e.vendedora,
              }),
              'Quando a resposta disser que o mes atual ainda nao fechou, DIGA ISSO: ' +
                'comparar mes parcial com mes inteiro faz o ano atual parecer pior sempre.',
            );
          }),
        );
      } else if (
        toolUse.name === 'comparar_com_periodo_anterior' &&
        params.gestaoCompararAnterior
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              periodo?: 'SEMANA' | 'MES' | 'ANO';
              de?: string;
              ate?: string;
              vendedora?: string;
            };
            return textoDeLinhas(
              await params.gestaoCompararAnterior!({
                periodo: e.periodo,
                de: e.de,
                ate: e.ate,
                vendedora: e.vendedora,
              }),
              'CLIENTES e VENDAS sao numeros diferentes: repasse o que perguntaram. ' +
                'E se vier o periodo anterior FECHADO, diga os dois.',
            );
          }),
        );
      } else if (toolUse.name === 'tom_da_conversa' && params.gestaoTom) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as { vendedora?: string; cliente?: string };
            return textoDeLinhas(
              await params.gestaoTom!({
                vendedora: String(e.vendedora ?? '').slice(0, 80),
                cliente: String(e.cliente ?? '').slice(0, 80),
              }),
              'Se a resposta disser que o celular dela nao esta conectado ou que ' +
                'a conversa e antiga demais, REPASSE — nao conclua que nao houve atendimento.',
            );
          }),
        );
      } else if (toolUse.name === 'metas_de_vendedora' && params.gestaoMetas) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as { vendedora?: string };
            return textoDaLeituraDeGestao(
              await params.gestaoMetas!({
                vendedora: String(e.vendedora ?? '').slice(0, 80),
              }),
              'meta',
            );
          }),
        );
      } else if (
        toolUse.name === 'quem_mais_vende' &&
        params.gestaoPorFamilia
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              familia?: string;
              limite?: number;
              mes?: number;
              periodo?: PeriodoVendasLlm | 'ONTEM' | 'ANO';
              de?: string;
              ate?: string;
            };
            const r = await params.gestaoPorFamilia!({
              familia: String(e.familia ?? '').slice(0, 40),
              limite: e.limite,
              mes: e.mes,
              periodo: e.periodo,
              de: e.de,
              ate: e.ate,
            });

            // A FAMILIA QUE NAO EXISTE VIRA PERGUNTA, e nao 'ninguem vendeu':
            // zero linhas seria indistinguivel de um periodo sem venda, e a
            // pessoa concluiria que ninguem vendeu brinco naquele mes.
            if (r.status === 'FAMILIA_DESCONHECIDA') {
              return (
                'Esse tipo de peca nao existe no catalogo. Os que existem: ' +
                (r.familias ?? []).join(', ') +
                '. Diga isso e pergunte qual deles ela quer.'
              );
            }
            if (r.linhas.length === 0) {
              return 'Ninguem vendeu esse tipo de peca no periodo. Diga isso em uma frase.';
            }
            return (
              `Ranking no periodo:\n${r.linhas.map((l) => `- ${l}`).join('\n')}\n\n` +
              'A primeira linha e a resposta. Repasse os numeros exatamente como estao.'
            );
          }),
        );
      } else if (
        toolUse.name === 'guardar_combinado' &&
        params.guardarCombinado
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const { texto } = toolUse.input as { texto?: string };
            const r = await params.guardarCombinado!({
              texto: String(texto ?? '').slice(0, 400),
            });

            // CADA RECUSA DIZ O QUE FAZER, e nao so o que houve. "Nao deu" faz
            // a agente pedir desculpa e parar; dizendo o teto, ela devolve a
            // conversa para quem pode resolver.
            if (r.status === 'VAZIO') {
              return 'Nao veio combinado nenhum. Pergunte o que ela quer que voce lembre.';
            }
            if (r.status === 'LONGO') {
              return `Longo demais (teto de ${r.teto} caracteres). Peca para resumir, ou proponha voce uma versao curta e confirme antes de guardar.`;
            }
            if (r.status === 'CHEIO') {
              return `Ja ha ${r.teto} combinados guardados, que e o maximo. Mostre a lista com listar_combinados e pergunte qual sai para este entrar.`;
            }
            return (
              'Guardado. Confirme em uma frase, com as SUAS palavras, e diga que ' +
              'vale daqui em diante. Se o combinado for um aviso automatico, diga ' +
              'tambem que voce nao dispara sozinha — que precisa que perguntem.'
            );
          }),
        );
      } else if (
        toolUse.name === 'listar_combinados' &&
        params.listarCombinados
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const { linhas } = await params.listarCombinados!();
            if (linhas.length === 0) {
              return 'Nao ha combinado guardado. Diga isso em uma frase.';
            }
            return (
              `Combinados guardados:\n${linhas.join('\n')}\n\n` +
              'Repasse a lista com os numeros — eles sao o que ela usa para pedir ' +
              'para esquecer algum.'
            );
          }),
        );
      } else if (
        toolUse.name === 'esquecer_combinado' &&
        params.esquecerCombinado
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const { numero } = toolUse.input as { numero?: number };
            const r = await params.esquecerCombinado!({
              numero: Number(numero ?? 0),
            });

            if (r.status === 'NAO_ACHEI') {
              // O numero errado NAO apaga nada, e a agente tem de dizer isso —
              // "pronto, esqueci" sobre um combinado que continua valendo e o
              // pior desfecho possivel aqui.
              return 'Nao ha combinado nessa posicao. Mostre a lista de novo e pergunte qual e.';
            }
            return `Esquecido: "${r.texto}". Confirme em uma frase, dizendo qual era.`;
          }),
        );
      } else if (toolUse.name === 'guardar_lembrete' && params.guardarLembrete) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            // O TETO E DO TURNO. Ver `TetosPorTurno` — sem isto, um turno de
            // cinco voltas guardaria cinco lembretes.
            if (tetos.lembreteGuardado) {
              return 'Voce ja guardou um lembrete neste turno. Confirme o que guardou e pergunte se ela quer marcar outro.';
            }
            const e = toolUse.input as { texto?: string; quandoIso?: string };
            const r = await params.guardarLembrete!({
              texto: String(e.texto ?? '').slice(0, 400),
              quandoIso: String(e.quandoIso ?? ''),
            });
            tetos.lembreteGuardado = true;
            return `${r.mensagem}\n\nResponda com isso, sem mudar o texto nem o horario.`;
          }),
        );
      } else if (toolUse.name === 'meus_lembretes' && params.meusLembretes) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const { linhas } = await params.meusLembretes!();
            return (
              `Lembretes dela:\n${linhas.join('\n')}\n\n` +
              'Repasse com os numeros — sao eles que ela usa para remarcar ou cancelar.'
            );
          }),
        );
      } else if (
        toolUse.name === 'remarcar_lembrete' &&
        params.remarcarLembrete
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as { qual?: string; quandoIso?: string };
            const r = await params.remarcarLembrete!({
              qual: String(e.qual ?? '').slice(0, 400),
              quandoIso: String(e.quandoIso ?? ''),
            });
            return `${r.mensagem}\n\nResponda com isso, sem mudar o texto nem o horario.`;
          }),
        );
      } else if (
        toolUse.name === 'cancelar_lembrete' &&
        params.cancelarLembrete
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as { qual?: string };
            const r = await params.cancelarLembrete!({
              qual: String(e.qual ?? '').slice(0, 400),
            });
            return `${r.mensagem}\n\nResponda com isso, sem mudar o texto.`;
          }),
        );
      } else if (toolUse.name === 'itens_mais_vendidos' && params.gestaoItens) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              periodo?: 'HOJE' | 'ONTEM' | 'SEMANA' | 'MES' | 'ANO';
              limite?: number;
              vendedora?: string;
              de?: string;
              ate?: string;
            };
            const r = await params.gestaoItens!(e);

            // Faltou dizer DE QUEM, e quem pergunta nao ve a loja inteira.
            // Nao e "nao encontrei": e uma pergunta incompleta, e dizer o
            // contrario faria a resposta soar como dado ausente.
            if (r.status === 'EXIGE_VENDEDORA') {
              return 'Esta consulta e sempre por vendedora. Pergunte de qual vendedora ela quer as pecas, sem mencionar permissao nem limitacao de acesso.';
            }
            if (r.status === 'NAO_ENCONTRADA') {
              return 'Nao achei essa vendedora na equipe. Diga isso e pergunte o nome de novo.';
            }
            if (r.status === 'AMBIGUA') {
              return (
                `Ha mais de uma vendedora com esse nome:\n${r.linhas.map((l) => `- ${l}`).join('\n')}\n\n` +
                'Pergunte qual delas.'
              );
            }
            if (r.linhas.length === 0) {
              return 'Nenhuma peca vendida nesse periodo. Diga isso em uma frase, e ofereca outro periodo.';
            }
            return (
              `Pecas que mais faturaram no periodo:\n${r.linhas.map((l) => `- ${l}`).join('\n')}\n\n` +
              'Repasse os numeros exatamente como estao, sem somar nem arredondar.'
            );
          }),
        );
      } else if (
        toolUse.name === 'panorama_da_equipe' &&
        params.gestaoPanorama
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              periodo?: PeriodoVendasLlm;
              de?: string;
              ate?: string;
            };
            const { linhas } = await params.gestaoPanorama!({
              periodo: e.periodo,
              de: e.de,
              ate: e.ate,
            });
            if (linhas.length === 0) {
              return 'Nenhuma vendedora ativa com venda nesse periodo. Diga isso em uma frase.';
            }
            return (
              `Equipe no periodo:\n${linhas.map((l) => `- ${l}`).join('\n')}\n\n` +
              'Repasse os numeros exatamente como estao.'
            );
          }),
        );
      } else if (
        toolUse.name === 'feedbacks_de_vendedora' &&
        params.gestaoFeedbacks
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              vendedora?: string;
              cliente?: string;
              dias?: number;
            };
            const r = await params.gestaoFeedbacks!({
              vendedora: String(e.vendedora ?? '').slice(0, 80),
              cliente: e.cliente ? String(e.cliente).slice(0, 120) : undefined,
              dias: typeof e.dias === 'number' ? e.dias : undefined,
            });
            return textoDosFeedbacks(r, Boolean(e.cliente));
          }),
        );
      } else if (
        toolUse.name === 'dia_da_vendedora' &&
        params.gestaoDiaDaVendedora
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as { vendedora?: string; dia?: string };
            const dia = String(e.dia ?? "");
            const r = await params.gestaoDiaDaVendedora!({
              vendedora: String(e.vendedora ?? "").slice(0, 80),
              dia: DATA_ISO.test(dia) ? dia : undefined,
            });
            return textoDoDiaDaVendedora(r);
          }),
        );
      } else if (
        toolUse.name === 'conversas_agora' &&
        params.gestaoConversasAgora
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as { vendedora?: string; minutos?: number };
            const nome = String(e.vendedora ?? '').slice(0, 80);
            const r = await params.gestaoConversasAgora!({
              vendedora: nome || undefined,
              minutos: typeof e.minutos === 'number' ? e.minutos : undefined,
            });
            return textoDasConversasAgora(r, Boolean(nome));
          }),
        );
      } else if (toolUse.name === 'listar_leads' && params.gestaoLeads) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const r = await params.gestaoLeads!();
            if (r.linhas.length === 0) {
              return 'Nenhum lead esperando encaminhamento. Diga isso.';
            }
            return (
              `${r.linhas.map((l) => `- ${l}`).join('\n')}\n\n` +
              'Repasse a lista assim e pergunte se ela quer encaminhar algum agora.'
            );
          }),
        );
      } else if (
        toolUse.name === 'listar_vendedoras' &&
        params.gestaoVendedoras
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const r = await params.gestaoVendedoras!();
            if (r.linhas.length === 0) {
              return 'Nenhuma vendedora ativa cadastrada. Diga isso.';
            }
            return (
              `${r.linhas.map((l) => `- ${l}`).join('\n')}\n\n` +
              'Repasse a lista assim, sem acrescentar numeros de venda.'
            );
          }),
        );
      } else if (
        toolUse.name === 'encaminhar_lead' &&
        params.gestaoEncaminharLead
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              vendedora?: string;
              lead?: string;
              quando?: string;
            };
            const r = await params.gestaoEncaminharLead!({
              vendedora: String(e.vendedora ?? '').slice(0, 120),
              lead: e.lead ? String(e.lead).slice(0, 120) : undefined,
              quando: e.quando ? String(e.quando).slice(0, 120) : undefined,
            });
            return textoDoEncaminhamento(r);
          }),
        );
      } else if (
        toolUse.name === 'de_quem_e_o_cliente' &&
        params.gestaoCarteiraDoCliente
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as { cliente?: string };
            const r = await params.gestaoCarteiraDoCliente!({
              cliente: String(e.cliente ?? '').slice(0, 120),
            });
            if (r.status === 'NAO_ENCONTRADO') {
              return 'Nenhum cliente com esse nome. Diga isso e pergunte se o nome esta completo.';
            }
            if (r.status === 'AMBIGUO') {
              return (
                `Mais de um cliente com esse nome:\n${r.linhas.map((l) => `- ${l}`).join('\n')}\n\n` +
                'Mostre as opcoes e pergunte de qual se trata.'
              );
            }
            return `${r.linhas.join('\n')}\n\nRepasse exatamente assim.`;
          }),
        );
      } else if (
        toolUse.name === 'consultar_vendas' &&
        params.consultarVendas
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              periodo?: PeriodoVendasLlm | 'ONTEM' | 'ANO';
              de?: string;
              ate?: string;
            };
            // Sem padrao fixo aqui: com `de` e `ate` preenchidos o atalho e
            // ignorado la dentro, e cravar 'HOJE' faria o handler achar que
            // houve escolha de periodo quando nao houve.
            const { resumo } = await params.consultarVendas!({
              periodo: e.periodo,
              de: e.de,
              ate: e.ate,
            });
            return (
              `Vendas dela no periodo: ${resumo}. Repasse estes numeros exatamente ` +
              'como estao, em uma ou duas frases naturais.'
            );
          }),
        );
      } else if (toolUse.name === 'consultar_metas' && params.consultarMetas) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const { metas } = await params.consultarMetas!();
            if (metas.length === 0) {
              return 'Ela nao tem meta cadastrada no momento. Diga isso em uma frase, sem inventar numero.';
            }
            return (
              `Metas dela:\n${metas.map((m) => `- ${m.linha}`).join('\n')}\n\n` +
              'Repasse os numeros exatamente como estao.'
            );
          }),
        );
      } else if (
        toolUse.name === 'consultar_produtos' &&
        params.gestaoProdutos &&
        !params.consultarProdutos
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const { produtos } = await params.gestaoProdutos!({
              busca: String(
                (toolUse.input as { busca?: string }).busca ?? '',
              ).slice(0, 120),
            });
            if (produtos.length === 0) {
              return 'Nenhuma peca encontrada com esse termo. Diga isso e pergunte se quer procurar de outro jeito.';
            }
            return (
              `Pecas encontradas:\n${produtos.map((p) => `- ${p.linha}`).join('\n')}\n\n` +
              'Repasse os numeros exatamente como estao.'
            );
          }),
        );
      } else if (
        toolUse.name === 'consultar_produtos' &&
        params.consultarProdutos
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const { produtos } = await params.consultarProdutos!({
              busca: String(
                (toolUse.input as { busca?: string }).busca ?? '',
              ).slice(0, 120),
            });
            if (produtos.length === 0) {
              return 'Nenhuma peca encontrada com esse termo. Diga isso a ela e pergunte se quer procurar de outro jeito.';
            }
            return (
              `Pecas encontradas:\n${produtos.map((p) => `- ${p.linha}`).join('\n')}\n\n` +
              'Repasse os precos e quantidades exatamente como estao. Se ela pedir custo ou margem, diga que voce nao consegue ver isso.'
            );
          }),
        );
      } else if (toolUse.name === 'meus_leads' && params.consultarMeusLeads) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const r = await params.consultarMeusLeads!();
            if (r.status === 'SEM_CODIGO') {
              return (
                'O cadastro dela esta sem codigo de vendedora, entao nao da para ' +
                'saber quais leads sao dela. Diga isso e peca para ela falar com a ' +
                'gestao. NAO diga que ela nao tem lead — e outra coisa.'
              );
            }
            if (r.linhas.length === 0) {
              return 'Nenhum lead foi encaminhado para ela ate agora. Diga isso em uma frase, sem inventar.';
            }
            const teto =
              r.total > r.linhas.length
                ? `\n\nSao ${r.total} no total; estes sao os ${r.linhas.length} mais recentes. Diga isso.`
                : '';
            return (
              `Leads encaminhados para ela:\n${r.linhas.map((l) => `- ${l}`).join('\n')}${teto}\n\n` +
              'Repasse nomes e telefones exatamente como estao — e por eles que ela entra em contato. ' +
              'NAO OFERECA AGENDAR NENHUM DELES: lead nao tem cadastro de cliente, e agendar_contato ' +
              'so aceita cliente da carteira. Se ela pedir para agendar um destes, diga que o lead ainda ' +
              'nao e cliente e por isso nao entra na agenda, e repasse o telefone para ela falar com a pessoa.'
            );
          }),
        );
      } else if (toolUse.name === 'atualizar_lead' && params.atualizarLead) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const e = toolUse.input as {
              lead?: string;
              status?: StatusLeadLlm;
              observacao?: string;
            };
            const r = await params.atualizarLead!({
              lead: String(e.lead ?? '').slice(0, 120),
              status: e.status ?? 'EM_CONTATO',
              // Vazio NAO e observacao: mandar string vazia apagaria a que ja
              // estava gravada. `undefined` quer dizer "nao mexe".
              observacao: e.observacao?.trim()
                ? e.observacao.slice(0, 500)
                : undefined,
            });
            // A frase ja vem pronta do servidor, com o veredito na frente.
            return r.mensagem;
          }),
        );
      } else if (
        toolUse.name === 'consultar_minha_carteira' &&
        params.consultarCarteiraAgora
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const r = await params.consultarCarteiraAgora!();
            if (r.total === 0) {
              return 'Ela nao tem nenhum cliente com atendimento em curso agora. Diga isso em uma frase, sem inventar numero.';
            }
            const espera =
              r.aguardandoRelato > 0
                ? `\n\n${r.aguardandoRelato} ${
                    r.aguardandoRelato === 1
                      ? 'desses esta esperando o relato DELA'
                      : 'desses estao esperando o relato DELA'
                  } — e o que ela precisa resolver.`
                : '';
            return (
              `Carteira dela AGORA: ${r.total} ${r.total === 1 ? 'cliente' : 'clientes'} ` +
              `em atendimento em curso — ${r.linhas.join(', ')}.${espera}\n\n` +
              'Repasse os numeros exatamente como estao. Isto e o estado de agora, ' +
              'nao um recorte de periodo: nao diga "hoje" nem "esta semana".'
            );
          }),
        );
      } else if (toolUse.name === 'agendar_contato' && params.agendarContato) {
        if (tetos.contatoAgendado) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content:
              'Ignorado: um agendamento por mensagem. Peca para ela tratar um cliente de cada vez.',
            is_error: true,
          });
          continue;
        }
        tetos.contatoAgendado = true;
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const entrada = toolUse.input as {
              cliente?: string;
              quandoIso?: string;
            };
            const r = await params.agendarContato!({
              cliente: String(entrada.cliente ?? '').slice(0, 120),
              quandoIso: String(entrada.quandoIso ?? ''),
            });
            return `${r.mensagem}\n\nResponda a ela com isso, sem alterar nomes nem horarios.`;
          }),
        );
      } else if (
        toolUse.name === 'clientes_sem_comprar' &&
        params.clientesSemComprar
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const entrada = toolUse.input as {
              meses?: number;
              dias?: number;
              desde?: string;
            };
            // NENHUM TRATAMENTO DE PADRAO AQUI — `dataDeCorte` decide, e e um
            // lugar so. Dois defaults em dois arquivos divergem na primeira
            // mudanca de um lado.
            const { clientes } = await params.clientesSemComprar!({
              meses: Number(entrada.meses) || undefined,
              dias: Number(entrada.dias) || undefined,
              desde: entrada.desde ? String(entrada.desde) : undefined,
            });
            if (clientes.length === 0) {
              return 'Nenhum cliente da carteira dela esta parado nesse periodo. Diga isso em uma frase.';
            }
            return (
              `Clientes parados:\n${clientes.map((c) => `- ${c.linha}`).join(`\n`)}\n\n` +
              'Repasse os nomes e as datas exatamente como estao.'
            );
          }),
        );
      } else if (toolUse.name === 'clientes_por_epoca' && params.clientesPorEpoca) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const entrada = toolUse.input as {
              mes?: number;
              dataComemorativa?: string;
            };
            const mes = Number(entrada.mes);
            const { clientes, total } = await params.clientesPorEpoca!({
              mes: mes >= 1 && mes <= 12 ? mes : undefined,
              dataComemorativa: entrada.dataComemorativa
                ? String(entrada.dataComemorativa)
                : undefined,
            });
            if (clientes.length === 0) {
              return 'Nenhuma compra da carteira dela nessa epoca. Diga isso em uma frase, e ofereca outro mes ou outra data.';
            }
            return (
              `Clientes dessa epoca (${total} no total):\n` +
              `${clientes.map((c) => `- ${c.linha}`).join('\n')}\n\n` +
              'Repasse os nomes e numeros exatamente como estao. "Em N anos diferentes" quer dizer que a pessoa comprou nessa mesma epoca em N anos — e o que separa habito de coincidencia; sem isso, nao afirme que alguem "sempre compra" nessa data.'
            );
          }),
        );
      } else if (
        toolUse.name === 'melhores_clientes' &&
        params.melhoresClientes
      ) {
        toolResults.push(
          await this.executarLeitura(toolUse, async () => {
            const entrada = toolUse.input as {
              categoria?: string;
              ultimos_meses?: number;
            };
            const { clientes } = await params.melhoresClientes!({
              categoria: entrada.categoria,
              ultimosMeses: entrada.ultimos_meses,
            });
            if (clientes.length === 0) {
              return 'Nenhuma compra encontrada na carteira dela com esse recorte. Diga isso em uma frase.';
            }
            return (
              `Maiores compradores:\n${clientes.map((c) => `- ${c.linha}`).join(`\n`)}\n\n` +
              'Repasse os nomes e numeros exatamente como estao.'
            );
          }),
        );
      } else if (
        toolUse.name === 'consultar_agenda' &&
        params.consultarAgenda
      ) {
        toolResults.push(
          await this.executarConsultarAgenda(toolUse, params.consultarAgenda),
        );
      } else if (
        toolUse.name === 'avisar_vendedora' &&
        params.avisarVendedora
      ) {
        if (tetos.avisoEnviado) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content:
              'Ignorado: apenas um aviso por mensagem. Peca a usuaria para tratar um cliente de cada vez.',
            is_error: true,
          });
          continue;
        }
        tetos.avisoEnviado = true;
        toolResults.push(
          await this.executarAvisarVendedora(toolUse, params.avisarVendedora),
        );
      }
    }

    // ========================================================================
    // NENHUM `tool_result` PODE IR VAZIO — 29/09/2026.
    //
    // A API recusa a chamada inteira com
    // `400 messages.N: user messages must have non-empty content`, e o erro
    // nao diz QUAL ferramenta produziu o vazio. O agente responde "nao
    // consegui consultar isso agora", e a causa fica escondida atras de uma
    // frase generica — foi o que aconteceu com o Lucas as 14:25.
    //
    // Uma ferramenta devolver nada e legitimo (uma consulta sem resultado, um
    // desfecho que o tradutor nao previu). O que nao pode e isso derrubar a
    // conversa: o modelo precisa saber que a ferramenta rodou e nao trouxe
    // texto, para dizer isso em vez de inventar.
    //
    // A guarda fica AQUI, e nao em cada tradutor, porque sao dezenas de
    // ferramentas e basta uma esquecer. Este e o funil por onde todas passam.
    // ========================================================================
    const resultadosSeguros = toolResults.map((r) =>
      typeof r.content === 'string' && r.content.trim() === ''
        ? {
            ...r,
            content:
              'A ferramenta rodou e nao devolveu texto. Diga que nao conseguiu ' +
              'essa informacao agora e ofereca outro caminho. NAO invente o dado.',
          }
        : r,
    );

    return { toolResults: resultadosSeguros, grafico };
  }


  /**
   * Envelope comum das ferramentas de LEITURA do canal interno.
   *
   * Sem teto de chamadas: ler duas vezes na mesma mensagem ("e amanha? e a
   * meta?") e uso legitimo. Falha vira tool_result de erro, e o modelo se
   * recupera na conversa em vez de derrubar a resposta inteira.
   */
  private async executarLeitura(
    toolUse: Anthropic.ToolUseBlock,
    corpo: () => Promise<string>,
  ): Promise<Anthropic.ToolResultBlockParam> {
    try {
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: await corpo(),
      };
    } catch (err) {
      // ====================================================================
      // DUAS FALHAS DIFERENTES DIZIAM A MESMA COISA, E FOI ISSO QUE ESCONDEU
      // UM DEFEITO POR OITO DIAS — 30/09/2026.
      //
      // Um `$` sumiu de um parametro SQL em 22/09 e derrubou
      // `feedbacks_de_vendedora`. Toda pergunta de feedback caia aqui, e a
      // agente respondia "tente de novo em instantes" — a MESMA frase de um
      // WAHA fora do ar. Ninguem tem como saber que aquilo nunca vai voltar,
      // entao ninguem reclamou, e o log dizia "Falha na ferramenta" como
      // diria para um timeout.
      //
      // O canal do WhatsApp nao tem quem abra chamado. Se a distincao nao
      // estiver aqui, ela nao existe em lugar nenhum.
      // ====================================================================
      const defeito = ehDefeitoDeCodigo(err);
      const mensagem = err instanceof Error ? err.message : 'erro desconhecido';

      if (defeito) {
        // NAO logamos `query` nem `parameters` do erro do TypeORM: os
        // parametros carregam hash de telefone e nome de cliente. A mensagem
        // do driver ("operator does not exist: ...") ja diz o que e preciso.
        this.logger.error(
          `DEFEITO NA FERRAMENTA ${toolUse.name} (${(err as Error).name}): ${mensagem}`,
        );
      } else {
        this.logger.error(`Falha na ferramenta ${toolUse.name}: ${mensagem}`);
      }

      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        // A pessoa nao precisa saber que e defeito — precisa saber que NAO
        // adianta insistir. Mandar tentar de novo o que nunca vai funcionar e
        // o pior dos dois mundos: ela perde tempo e nos nao ficamos sabendo.
        content: defeito
          ? 'Essa consulta esta com defeito, e tentar de novo nao resolve. Diga que nao consegue trazer isso agora, que o problema ja foi registrado, e ofereca outro caminho. NAO ofereca tentar de novo.'
          : 'Nao consegui consultar isso agora. Peca desculpa e diga que ela pode tentar de novo em instantes.',
        is_error: true,
      };
    }
  }

  /**
   * Executa `registrar_relato`. O texto de volta ja vem pronto do servidor —
   * o modelo repassa, nao reescreve, porque a frase carrega horario remarcado
   * e desfecho, que sao exatamente o que ele inventaria.
   */
  private async executarRegistrarRelato(
    toolUse: Anthropic.ToolUseBlock,
    handler: NonNullable<ChatParams['registrarRelato']>,
  ): Promise<Anthropic.ToolResultBlockParam> {
    try {
      const r = await handler();

      if (r.status === 'SEM_PENDENCIA') {
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content:
            'Nao ha retorno pendente dela. Diga que nao ha acompanhamento aberto no momento e que, quando voce encaminhar um cliente, ela conta por aqui como foi.',
        };
      }

      if (r.status === 'NAO_ENTENDI') {
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content:
            'Nao deu para entender o relato. Pergunte a ela, em uma frase, se chegou a falar com o cliente e, se ficou de retornar, qual o horario.',
        };
      }

      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `Relato registrado. Responda a ela exatamente isto, sem alterar horarios nem nomes: "${r.mensagem}"`,
      };
    } catch (err) {
      this.logger.error(
        `Falha ao registrar o relato: ${err instanceof Error ? err.message : err}`,
      );
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content:
          'Nao consegui registrar agora. Peca desculpa e diga que ela pode repetir em instantes.',
        is_error: true,
      };
    }
  }

  /**
   * Executa `consultar_agenda`. Sem teto de chamadas: e leitura, e perguntar
   * "e amanha?" na mesma mensagem e uso legitimo.
   *
   * O tool_result ja vai FORMATADO. O modelo repassa o que esta escrito em vez
   * de recalcular horario — data e hora sao exatamente onde ele inventa.
   */
  private async executarConsultarAgenda(
    toolUse: Anthropic.ToolUseBlock,
    handler: NonNullable<ChatParams['consultarAgenda']>,
  ): Promise<Anthropic.ToolResultBlockParam> {
    const input = toolUse.input as { periodo?: PeriodoAgendaLlm };
    try {
      const { compromissos } = await handler({
        periodo: input.periodo ?? 'HOJE',
      });

      if (compromissos.length === 0) {
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content:
            'Nenhum compromisso agendado nesse periodo. Diga isso a ela em uma frase, sem inventar nada.',
        };
      }

      const linhas = compromissos
        .map(
          (c) =>
            `- ${c.cliente}, ${c.quando}${c.ocasiao ? ` (${c.ocasiao.toLowerCase()})` : ''}`,
        )
        .join('\n');

      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content:
          `Compromissos dela:\n${linhas}\n\nRepasse exatamente estes nomes e horarios, ` +
          'sem alterar nem completar. Escreva em uma ou duas frases naturais.',
      };
    } catch (err) {
      this.logger.error(
        `Falha ao consultar a agenda: ${err instanceof Error ? err.message : err}`,
      );
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content:
          'Nao consegui consultar a agenda agora. Peca desculpa e diga que ela pode tentar de novo em instantes.',
        is_error: true,
      };
    }
  }

  // Executa a tool registrar_demanda e monta o tool_result. Nunca loga a
  // descricao (texto livre). Em falha, devolve um tool_result de erro para o
  // modelo se recuperar na conversa sem derrubar o chat.
  private async executarRegistrarDemanda(
    toolUse: Anthropic.ToolUseBlock,
    handler: NonNullable<ChatParams['registrarDemanda']>,
  ): Promise<Anthropic.ToolResultBlockParam> {
    const input = toolUse.input as DemandaToolInput;
    try {
      const { id } = await handler({
        tipo: input.tipo,
        descricao: (input.descricao ?? '').slice(0, DEMANDA_DESCRICAO_MAX),
      });
      const idCurto = id.slice(0, 8);
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `Demanda registrada com sucesso (protocolo ${idCurto}). A equipe técnica vai acompanhar. Informe o protocolo à usuária e diga que o time dará retorno.`,
      };
    } catch (erro) {
      this.logger.error(
        `Falha ao registrar demanda via tool: ${(erro as Error).message}`,
      );
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        is_error: true,
        content:
          'Não foi possível registrar a demanda agora. Peça desculpas à usuária e sugira tentar novamente em instantes.',
      };
    }
  }

  private async executarAvisarVendedora(
    toolUse: Anthropic.ToolUseBlock,
    handler: NonNullable<ChatParams['avisarVendedora']>,
  ): Promise<Anthropic.ToolResultBlockParam> {
    const input = toolUse.input as AvisarToolInput;
    const texto = (v: unknown, max: number): string | undefined => {
      if (typeof v !== 'string') return undefined;
      const limpo = v.trim().slice(0, max);
      return limpo.length > 0 ? limpo : undefined;
    };

    const cliente = texto(input.cliente, AVISO_CLIENTE_MAX);
    if (!cliente) {
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        is_error: true,
        content:
          'Faltou o nome do cliente. Pergunte à usuária de qual cliente se trata.',
      };
    }

    try {
      const r = await handler({
        cliente,
        assunto: texto(input.assunto, AVISO_TRECHO_MAX),
        quando: texto(input.quando, AVISO_TRECHO_MAX),
        quandoIso: texto(input.quando_iso, 40),
        ocasiao: texto(input.ocasiao, 30),
      });
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        // Falha de NEGOCIO (cliente sem vendedora, por exemplo) nao e erro de
        // ferramenta: o modelo precisa explicar o motivo à usuária, nao pedir
        // desculpas por uma falha tecnica.
        is_error: r.status === 'FALHA_ENVIO' ? true : undefined,
        content: r.mensagem,
      };
    } catch (erro) {
      this.logger.error(
        `Falha ao avisar vendedora via tool: ${(erro as Error).message}`,
      );
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        is_error: true,
        content:
          'Não foi possível avisar a vendedora agora. Peça desculpas à usuária e sugira tentar novamente em instantes.',
      };
    }
  }

  /**
   * ==========================================================================
   * NENHUM TURNO PODE IR VAZIO — 30/09/2026, e e a SEGUNDA vez.
   *
   * `400 messages.N: user messages must have non-empty content` rejeita a
   * conversa INTEIRA, e o erro nao diz de onde veio o vazio. Quem chamou cai
   * no proprio catch e responde "nao consegui consultar isso agora" — a frase
   * generica que esconde a causa.
   *
   * Em 29/09 o vazio era um `tool_result`; a guarda esta no `despachar`. Em
   * 30/09 foi o turno do usuario: alguem mencionou a agente num grupo sem
   * escrever mais nada, e depois de tirar a mencao nao sobrou texto. Duas
   * portas diferentes, o mesmo 400, e a mesma resposta inutil.
   *
   * A guarda fica AQUI porque este e o funil por onde toda mensagem de todo
   * canal passa. Quem chama com um turno vazio tem um defeito — e o lugar de
   * consertar e la, com texto que faca sentido para o modelo —, mas nao pode
   * derrubar a conversa por isso.
   * ==========================================================================
   */
  private toApiMessages(
    mensagens: ChatParams['mensagens'],
  ): Anthropic.MessageParam[] {
    return mensagens.map((m) => {
      const vazio =
        typeof m.content === 'string' && m.content.trim() === '';
      if (vazio) {
        this.logger.warn(
          `Turno "${m.role}" chegou VAZIO ao cliente — trocado por um marcador ` +
            'para nao derrubar a conversa. Quem montou a mensagem deveria ter ' +
            'texto aqui.',
        );
      }
      return {
        role: m.role,
        content: vazio ? '(mensagem sem texto)' : m.content,
      };
    });
  }

  private extrairTexto(resp: Anthropic.Message): string {
    const bloco = resp.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    const texto = bloco?.text ?? '';

    // ====================================================================
    // RESPOSTA SEM TEXTO NAO PODE SAIR CALADA — 29/09/2026.
    //
    // Devolver '' e correto: quem chama tem de lidar com a ausencia. O que
    // nao era correto e sair sem dizer NADA, porque "veio vazia" tem causas
    // que exigem consertos opostos:
    //
    //   stop_reason 'max_tokens'  -> o teto e baixo demais
    //   stop_reason 'refusal'     -> o modelo recusou o conteudo
    //   so blocos nao-texto       -> a chamada pediu a coisa errada
    //
    // Custou uma manha em 29/09: o leitor de conversas recebia '' e relatava
    // "0 lidas, 0 ignoradas, 0 falhas", como se nao houvesse o que ler.
    //
    // So METADADOS entram no log — nunca o texto, que aqui e conversa de
    // cliente.
    // ====================================================================
    if (!texto) {
      this.logger.warn(
        `O modelo devolveu resposta sem texto: stop_reason=${resp.stop_reason} ` +
          `blocos=[${resp.content.map((b) => b.type).join(',') || 'vazio'}] ` +
          `tokens=${resp.usage.output_tokens}.`,
      );
    }

    return texto;
  }
}

/**
 * Traduz o resultado de uma leitura de gestao no texto que volta ao modelo.
 *
 * As tres leituras (agenda, vendas, metas) tem a MESMA forma porque compartilham
 * o mesmo problema: antes de responder qualquer coisa, e preciso resolver de
 * quem se esta falando. Um so lugar decide o que dizer em cada desfecho, entao
 * as tres se comportam igual — inclusive na ambiguidade, que e onde um palpite
 * sairia caro.
 */
/**
 * O resumo do dia vira instrucao para o modelo.
 *
 * A ultima frase existe porque a tentacao do modelo, com numeros na mao, e
 * completar a historia: "ela deve estar negociando um anel". Estes dados nao
 * sustentam isso — eles contam pontos, nao leem conversa.
 */
function textoDoDiaDaVendedora(r: GestaoLeituraResultado): string {
  if (r.status === 'AMBIGUA') {
    return (
      `Mais de uma vendedora com esse nome: ${(r.nomes ?? []).join(", ")}. ` +
      'Pergunte de qual se trata. NAO escolha uma.'
    );
  }
  if (r.status === 'NAO_ENCONTRADA') {
    const equipe = (r.nomes ?? []).join(", ");
    return equipe
      ? `Nao ha vendedora com esse nome. A equipe ativa e: ${equipe}. Diga isso e pergunte qual delas.`
      : 'Nao ha vendedora com esse nome. Diga isso em uma frase.';
  }
  if (r.linhas.length === 0) {
    // ====================================================================
    // O VAZIO TINHA UMA EXPLICACAO SO, E ELA ENVELHECEU — 29/09/2026.
    //
    // Ate hoje este texto oferecia como UNICA hipotese "o numero dela ainda
    // nao esta pareado". Era verdade enquanto nenhum celular estava
    // conectado. No dia em que o primeiro foi pareado, virou a hipotese
    // ERRADA — e continuou sendo a unica que o modelo tinha: o Lucas trocou
    // mensagem com a vendedora as 15:08 e as 15:17 ouviu que o celular dela
    // talvez nao estivesse conectado, com o celular conectado.
    //
    // Agora vem a hipotese CERTA primeiro — o registro do dia nasce da
    // leitura, que roda uma hora depois da ultima mensagem — e a antiga vira
    // o que sempre deveria ter sido: algo a CONFERIR, com a ferramenta que
    // sabe conferir, em vez de um palpite entregue como explicacao.
    // ====================================================================
    return (
      `Nao ha nenhum registro de ${r.vendedora} nesse dia. Diga isso em uma ` +
      'frase. NAO conclua que ela nao trabalhou, e NAO afirme que o celular ' +
      'dela esta desconectado — voce nao verificou isso. Se o dia perguntado ' +
      'for HOJE, a explicacao mais provavel e outra: o registro do dia nasce ' +
      'da leitura das conversas, que so roda UMA HORA depois da ultima ' +
      'mensagem, entao conversa recente ainda nao aparece aqui. Para saber se ' +
      'ela esta conversando NESTE MOMENTO, use conversas_agora. Para saber se ' +
      'o celular dela esta mesmo conectado, use listar_vendedoras.'
    );
  }
  return (
    `O dia de ${r.vendedora}:\n${r.linhas.map((l) => `- ${l}`).join("\n")}\n\n` +
    'Conte isso como quem esta contando o dia dela, em texto corrido. Repasse ' +
    'os numeros exatamente como estao. NAO diga o que as clientes queriam nem ' +
    'o assunto das conversas — isto aqui nao le o texto delas. E quem aparece ' +
    'como "numero ainda NAO identificado" NAO pode ser chamado de cliente nem ' +
    'entrar numa contagem de clientes: o sistema so descobre de quem e o numero ' +
    'quando le a conversa, uma hora depois da ultima mensagem.'
  );
}

/**
 * O AGORA das conversas — 29/09/2026.
 *
 * ==========================================================================
 * O VAZIO AQUI E INFORMACAO, E PRECISA DIZER O QUE NAO E.
 *
 * "Ninguem conversando" pode ser calmaria ou pode ser celular desconectado, e
 * as duas exigem reacoes opostas. Esta funcao NAO escolhe entre elas — manda o
 * modelo conferir com quem sabe (`listar_vendedoras`), que e exatamente o que
 * faltava no `dia_da_vendedora` e produziu o palpite errado de 29/09.
 * ==========================================================================
 */
function textoDasConversasAgora(
  r: GestaoLeituraResultado,
  pediuVendedora: boolean,
): string {
  if (r.status === 'AMBIGUA') {
    return (
      `Mais de uma vendedora com esse nome: ${(r.nomes ?? []).join(', ')}. ` +
      'Pergunte de qual se trata. NAO escolha uma.'
    );
  }
  if (r.status === 'NAO_ENCONTRADA') {
    const equipe = (r.nomes ?? []).join(', ');
    return equipe
      ? `Nao ha vendedora com esse nome. A equipe ativa e: ${equipe}. Diga isso e pergunte qual delas.`
      : 'Nao ha vendedora com esse nome. Diga isso em uma frase.';
  }
  if (r.linhas.length === 0) {
    const quem = pediuVendedora ? r.vendedora : 'ninguem';
    return (
      `Nenhuma conversa em andamento ${pediuVendedora ? `de ${quem}` : 'na loja'} ` +
      'nesta janela. Diga isso em uma frase, e NAO afirme o motivo: pode ser ' +
      'calmaria ou pode ser celular desconectado, e voce nao sabe qual. Se ' +
      'importar para quem perguntou, use listar_vendedoras para conferir as ' +
      'conexoes antes de opinar.'
    );
  }
  return (
    `Conversas em andamento AGORA:\n${r.linhas.map((l) => `- ${l}`).join('\n')}\n\n` +
    'Conte isso em texto corrido. REGRAS: (1) NAO diga sobre o que estao ' +
    'conversando — isto nao le o texto das mensagens, so sabe que houve troca ' +
    'e ha quanto tempo; (2) quem aparece como "numero ainda NAO identificado" ' +
    'NAO pode ser chamado de cliente nem entrar numa contagem de clientes: o ' +
    'sistema so descobre de quem e o numero depois que le a conversa, uma hora ' +
    'depois da ultima mensagem. Repasse como "ainda nao identificado".'
  );
}

/**
 * O envelope dos FEEDBACKS.
 *
 * Separado do `textoDaLeituraDeGestao` por uma razao so: aqui o formato da
 * resposta importa tanto quanto o conteudo. Numeros de venda cabem numa
 * frase; tres relatos de clientes diferentes viram um paragrafo em que
 * ninguem acha nada. Quem le quer localizar UM cliente de relance.
 *
 * Nada de markdown: o chat do painel mostra o asterisco cru.
 */
function textoDosFeedbacks(
  r: GestaoLeituraResultado & { total?: number },
  umClienteSo: boolean,
): string {
  if (r.status === 'AMBIGUA') {
    return (
      `Mais de uma vendedora com esse nome: ${(r.nomes ?? []).join(', ')}. ` +
      'Pergunte de qual se trata. NAO escolha uma.'
    );
  }
  if (r.status === 'NAO_ENCONTRADA') {
    const equipe = (r.nomes ?? []).join(', ');
    return equipe
      ? `Nao ha vendedora com esse nome. A equipe ativa e: ${equipe}. Diga isso e pergunte qual delas.`
      : 'Nao ha vendedora com esse nome. Diga isso em uma frase.';
  }
  if (r.linhas.length === 0) {
    return (
      `${r.vendedora} nao tem feedback registrado nesse recorte. ` +
      'Diga isso em uma frase e ofereca outro periodo. Nao invente conteudo.'
    );
  }

  const total = r.total;
  const truncou = typeof total === 'number' && total > r.linhas.length;

  return [
    `Feedbacks de ${r.vendedora}:`,
    r.linhas.map((l) => `- ${l}`).join('\n'),
    '',
    'COMO RESPONDER:',
    umClienteSo
      ? '- este e UM atendimento: liste as falas em ordem, uma linha cada, dizendo a hora de cada uma'
      : '- UMA LINHA POR ATENDIMENTO, comecando pelo nome do cliente. NAO junte em paragrafo: quem le precisa achar um cliente de relance',
    '- repasse a frase da vendedora entre aspas, sem reescrever nem resumir',
    '- nao use asterisco, cerquilha nem markdown: o chat mostra os simbolos crus',
    '- uma frase curta de fechamento no fim, se houver o que dizer',
    truncou
      ? `- SAO ${total} NO TOTAL e voce recebeu ${r.linhas.length}. DIGA o total e ofereca filtrar por cliente ou por periodo.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * O funil, dito ao modelo.
 *
 * NAO REUSA O `textoDaLeituraDeGestao` no caminho feliz por um motivo: la a
 * frase de lista vazia comeca com o nome da vendedora, e aqui a consulta pode
 * nao ter vendedora nenhuma — e a loja. "undefined nao tem nenhum atendimento"
 * seria o resultado. Os dois ramos de nome (ambiguo, inexistente) continuam
 * vindo de la, que e onde eles ja estao certos.
 */
/**
 * O panorama de leads, dito ao modelo.
 *
 * Mesmo motivo do `textoDoFunil` para nao reusar o caminho feliz do
 * `textoDaLeituraDeGestao`: aqui a consulta pode nao ter vendedora nenhuma.
 */
function textoDosLeads(r: GestaoLeituraResultado & { total?: number }): string {
  if (r.status !== 'OK') {
    return textoDaLeituraDeGestao(r, 'lead');
  }
  const alvo = r.vendedora ?? 'A fila';
  if (r.linhas.length === 0) {
    return `${alvo} nao tem nenhum lead. Diga isso em uma frase, sem inventar numero.`;
  }
  return (
    `Leads ${r.vendedora ? `de ${r.vendedora}` : '(fila inteira)'}:\n` +
    r.linhas.map((l) => `- ${l}`).join('\n') +
    '\n\nRepasse nomes, telefones e numeros exatamente como estao. Nao omita ' +
    'nenhum item da lista. NAO OFERECA AGENDAR NENHUM DELES: lead nao tem cadastro ' +
    'de cliente, e a ferramenta de agendar so aceita cliente. O que da para fazer com ' +
    'um lead e encaminhar para uma vendedora.'
  );
}

function textoDoFunil(r: GestaoLeituraResultado & { total?: number }): string {
  if (r.status !== 'OK') {
    return textoDaLeituraDeGestao(r, 'atendimento em curso');
  }
  const alvo = r.vendedora ?? 'A loja';
  if (r.linhas.length === 0) {
    return `${alvo} nao tem nenhum atendimento em curso agora. Diga isso em uma frase, sem inventar numero.`;
  }
  return (
    `Funil de ${alvo}, AGORA (so atendimentos em curso):\n` +
    r.linhas.map((l) => `- ${l}`).join('\n') +
    '\n\nRepasse os numeros exatamente como estao. Isto e o estado de agora, ' +
    'nao um recorte de periodo: nao diga "hoje" nem "esta semana". Nao ha ' +
    'valor de venda nestes dados — nao some dinheiro a esta resposta.'
  );
}

function textoDaLeituraDeGestao(
  r: GestaoLeituraResultado,
  substantivo: string,
): string {
  if (r.status === 'AMBIGUA') {
    return (
      `Mais de uma vendedora com esse nome: ${(r.nomes ?? []).join(', ')}. ` +
      'Pergunte de qual se trata. NAO escolha uma.'
    );
  }
  if (r.status === 'NAO_ENCONTRADA') {
    const equipe = (r.nomes ?? []).join(', ');
    return equipe
      ? `Nao ha vendedora com esse nome. A equipe ativa e: ${equipe}. Diga isso e pergunte qual delas.`
      : 'Nao ha vendedora com esse nome. Diga isso em uma frase.';
  }
  if (r.linhas.length === 0) {
    return `${r.vendedora} nao tem nenhum(a) ${substantivo} nesse recorte. Diga isso em uma frase, sem inventar numero.`;
  }

  // O TETO PRECISA SER DITO. Mostrar dez de trezentos sem falar dos trezentos
  // faz a resposta parecer completa — e quem le vai embora com o numero
  // errado na cabeca.
  const total = (r as { total?: number }).total;
  const truncou = typeof total === 'number' && total > r.linhas.length;

  return (
    `${r.vendedora}:\n${r.linhas.map((l) => `- ${l}`).join('\n')}\n\n` +
    (truncou
      ? `SAO ${total} NO TOTAL — estes sao os ${r.linhas.length} primeiros. ` +
        'DIGA o total na resposta e ofereca ajudar a filtrar: perguntar se ' +
        'procuram algum cliente especifico, ou se querem outro recorte de ' +
        'periodo. Nunca deixe parecer que a lista e completa.\n\n'
      : '') +
    'Repasse os nomes, horarios e numeros exatamente como estao.'
  );
}

/**
 * O status do encaminhamento virando instrucao para a Anastasia.
 *
 * CADA ERRO JA VEM COM A SAIDA. "Nao encaminhei" sozinho deixa a usuaria sem
 * o proximo passo, e ela responde ao aviso de novo — a mesma armadilha de
 * criar uma pergunta sem resposta possivel.
 */
function textoDoEncaminhamento(r: {
  status: string;
  leadNome?: string;
  vendedoraNome?: string;
  termo?: string;
  nomes?: string[];
  sugestoes?: string[];
}): string {
  const lista = (xs?: string[]) => (xs ?? []).map((x) => `- ${x}`).join('\n');

  switch (r.status) {
    case 'ENCAMINHADO':
      return (
        `Encaminhado: ${r.leadNome} foi para ${r.vendedoraNome}, que ja recebeu os dados e o telefone no WhatsApp. ` +
        'Confirme isso em uma frase.'
      );
    case 'NENHUM_LEAD':
      return 'Nenhum lead esperando encaminhamento agora. Diga isso.';
    case 'LEAD_AMBIGUO':
      return (
        `Ha mais de um lead esperando:\n${lista(r.nomes)}\n\n` +
        'Mostre os nomes e pergunte qual deles encaminhar.'
      );
    case 'LEAD_NAO_ENCONTRADO':
      return (
        `Nenhum lead com o nome "${r.termo}". Os que esperam sao:\n${lista(r.nomes)}\n\n` +
        'Mostre a lista e pergunte qual e.'
      );
    case 'VENDEDORA_NAO_ENCONTRADA':
      return (
        `Nenhuma vendedora ativa com o nome "${r.termo}". As ativas sao:\n${lista(r.sugestoes)}\n\n` +
        'Mostre a lista e pergunte para qual encaminhar.'
      );
    case 'VENDEDORA_AMBIGUA':
      return (
        `Mais de uma vendedora com esse nome:\n${lista(r.nomes)}\n\n` +
        'Pergunte qual delas.'
      );
    case 'VENDEDORA_SEM_CODIGO':
      return (
        `${r.vendedoraNome} nao tem codigo do ERP no cadastro, e sem ele nao da para registrar o encaminhamento. ` +
        'Diga isso e sugira completar o cadastro dela.'
      );
    case 'VENDEDORA_SEM_WHATSAPP':
      return (
        `${r.vendedoraNome} nao tem WhatsApp interno cadastrado. ` +
        'Diga que o lead continua esperando e que o numero dela precisa ser cadastrado.'
      );
    case 'NUMERO_SEM_WHATSAPP':
      return (
        `O numero cadastrado de ${r.vendedoraNome} nao corresponde a uma conta de WhatsApp. ` +
        'Diga que o lead continua esperando.'
      );
    default:
      return (
        `Nao consegui avisar ${r.vendedoraNome ?? 'a vendedora'} agora. ` +
        'Diga que o lead continua esperando e que da para tentar de novo.'
      );
  }
}

/**
 * O texto de uma leitura que devolve LINHAS, e nao uma vendedora — 29/09/2026.
 *
 * ==========================================================================
 * NUNCA DEVOLVE STRING VAZIA, E ESSE E O PONTO.
 *
 * Um `tool_result` vazio faz a API recusar a conversa inteira com
 * `400 user messages must have non-empty content` — e o erro nao diz qual
 * ferramenta produziu o vazio. O agente responde "nao consegui consultar isso
 * agora" e a causa fica escondida atras de uma frase generica.
 *
 * Aconteceu em 29/09/2026, as 14:25, com o Lucas do outro lado.
 * ==========================================================================
 *
 * @param orientacao o que o modelo precisa saber para NAO deturpar o dado.
 *        Vive aqui, e nao no prompt, porque e especifica da ferramenta e
 *        so importa quando ela foi usada.
 */
function textoDeLinhas(
  r: { status?: string; linhas?: string[]; nomes?: string[] },
  orientacao: string,
): string {
  if (r.status === 'AMBIGUA') {
    return (
      `Mais de uma vendedora com esse nome: ${(r.nomes ?? []).join(', ')}. ` +
      'Pergunte de qual se trata. NAO escolha uma.'
    );
  }
  if (r.status === 'NAO_ENCONTRADA') {
    const equipe = (r.nomes ?? []).join(', ');
    return equipe
      ? `Nao ha vendedora com esse nome. A equipe ativa e: ${equipe}. Diga isso e pergunte qual delas.`
      : 'Nao ha vendedora com esse nome, ou nao veio nome nenhum. Pergunte de quem se trata — ou, se a pergunta era sobre a loja inteira, use a ferramenta correspondente.';
  }

  const linhas = r.linhas ?? [];
  if (linhas.length === 0) {
    return 'A consulta rodou e nao devolveu nada nesse recorte. Diga isso em uma frase, sem inventar numero.';
  }

  return `${linhas.join('\n')}\n\n${orientacao}`;
}
