import { Injectable } from '@nestjs/common';
import { type OpcaoMenu, RecepcaoService } from '../recepcao.service';

/**
 * A recepcao do canal interno: quem chega dizendo so "oi" e recebido pelo
 * nome e com o que ELE pode fazer.
 *
 * ==========================================================================
 * O CANAL SABIA QUEM ERA A PESSOA E NAO DIZIA.
 *
 * Ate 15/09/2026, "Olá" tinha tres destinos conforme o telefone: a Elena
 * respondia livremente, a Anastasia respondia "Como posso te ajudar?" e o
 * estoque recebia a lista de catalogos abertos. Nenhum dos tres dizia O QUE
 * DA PARA PEDIR — a pessoa tinha de adivinhar o vocabulario do sistema.
 *
 * Pedido do Lucas em 15/09/2026: "tipo: Olá, bom dia. O que gostaria hoje..
 * aí olhava o telefone.. aí teria o que ela era.. admin, estoquista,
 * vendedora.. aí falava as opções dela".
 * ==========================================================================
 *
 * SEM LLM, e aqui a economia e dupla. A saudacao e a mensagem mais comum do
 * canal e a que menos precisa de modelo: a resposta e sempre a mesma para o
 * mesmo perfil. Cada "bom dia" que nao vira chamada e latencia e custo que
 * ninguem paga — e uma resposta que nao varia de um dia para o outro.
 *
 * O MENU NAO SABE FAZER NADA. Cada linha aponta para um caminho que ja
 * existia: as do catalogo chamam o canal do catalogo, e as dos agentes viram
 * A FRASE que a pessoa teria escrito. Nenhuma regra de negocio mora aqui —
 * se morasse, existiriam duas respostas para a mesma pergunta conforme a
 * porta de entrada.
 *
 * O QUE APARECE VEM DA PERMISSAO DE VERDADE, resolvida pelo telefone no
 * roteador. Ninguem ve linha que nao pode usar, e o menu nunca promete o que
 * o sistema negaria em seguida.
 */

/** O que este telefone e, do ponto de vista do canal. */
export interface PerfilDoCanal {
  vendedora: boolean;
  gestao: boolean;
  catalogo: boolean;
}

/**
 * Saudacao SOZINHA — e a palavra "sozinha" e a regra inteira.
 *
 * "Oi" e saudacao; "Oi, como estao minhas vendas?" nao e, e tem de seguir
 * para o agente como seguia antes. Um menu respondido a quem ja perguntou
 * seria um passo a mais para ler a mesma coisa.
 *
 * O "tudo bem" opcional entra porque ninguem escreve so "oi": a forma que
 * chega de verdade e "oi, tudo bem?".
 */
const RE_SAUDACAO =
  /^(oi+|ola|opa|eae|e ai|hey|hi|hello|alo|bom dia|boa tarde|boa noite|comecar|inicio|start)( (tudo bem|tudo bom|td bem|beleza|blz))?$/;

/**
 * "O QUE VOCE FAZ?" — a pergunta que MERECE a lista.
 *
 * ==========================================================================
 * SEPARADO DA SAUDACAO EM 29/09/2026, E A SEPARACAO E O PEDIDO.
 *
 * O Lucas: "Bom dia, Lucas! Em que posso ajudar hoje? ou algo assim. Aí se a
 * pessoa perguntar o que você pode fazer, aí você passaria — mas não queria
 * logo de cara".
 *
 * Ate aqui "oi" e "ajuda" caiam no mesmo balde e recebiam a mesma resposta
 * comprida. Sao perguntas diferentes: quem diz "oi" esta abrindo conversa,
 * quem diz "ajuda" esta perguntando o que existe. So a segunda pede a lista.
 *
 * `menu`, `ajuda` e `opcoes` VIERAM DA RE_SAUDACAO — estavam la desde 15/09,
 * e e por isso que esta mudanca nao perde nada: a porta ja existia, so
 * respondia a coisa errada para a outra metade.
 * ==========================================================================
 */
const RE_PEDIDO_DE_AJUDA =
  /^(menu|ajuda|opcoes|socorro|o que (voce|vc|tu) (faz|pode fazer|sabe fazer|consegue fazer)|o que (da|tem) (pra|para) (pedir|perguntar)|como (voce |vc )?funciona|em que (voce|vc) (pode )?ajuda)r?$/;

/**
 * Tira acento, pontuacao e emoji para comparar — o mesmo tratamento do canal
 * do catalogo. "Olá!!" e "ola 👋" sao a mesma saudacao.
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * O QUE EU FACO, NUMA FRASE — 29/09/2026.
 *
 * ==========================================================================
 * SUBSTITUIU O MENU NUMERADO, E A DIFERENCA E DE TOM, NAO DE CONTEUDO.
 *
 * Pedido do Lucas: "vamos ser mais natural, sem essa pegada de chatbot, e ser
 * breve, sem muito textão". Seis linhas numeradas com "responde o número" sao
 * a cara de robo de atendimento — e quem fala aqui trabalha na loja, nao e
 * cliente perdido num SAC.
 *
 * ESCRITO A MAO, e nao montado a partir dos rotulos de `opcoesDe`. Colar
 * "Panorama do dia, Vendas por vendedora, Funil de atendimentos" numa frase
 * daria justamente o texto de menu que se queria tirar, so que sem as quebras
 * de linha. Rotulo de lista e frase de conversa sao registros diferentes.
 *
 * O PRECO E A SINCRONIA: acrescentar uma capacidade nova exige lembrar deste
 * arquivo. E aceitavel porque a frase e um CONVITE, e nao um contrato — ela
 * nao precisa listar tudo, precisa dar o primeiro empurrao. Quem perguntar
 * qualquer outra coisa continua sendo atendido pelas ferramentas.
 * ==========================================================================
 */
function resumoDe(perfil: PerfilDoCanal): string | null {
  if (perfil.vendedora) {
    return 'Posso ver suas vendas, suas metas, sua carteira e sua agenda, e consultar peça e preço. O que você precisa?';
  }

  if (perfil.gestao) {
    // A frase muda quando a pessoa tambem cuida de catalogo — e o caso do ADM
    // que fotografa. Sem isso, ela nao saberia que pode mandar a foto por aqui.
    return perfil.catalogo
      ? 'Posso ver vendas, metas, agenda e o funil da equipe — e você também pode mandar foto para o catálogo. O que você precisa?'
      : 'Posso ver vendas, metas, agenda e o funil da equipe. O que você precisa?';
  }

  if (perfil.catalogo) {
    return 'É só mandar a foto com o código que eu coloco no catálogo. Também consulto peça e preço.';
  }

  // Ninguem chega aqui: o roteador so recepciona quem foi reconhecido. `null`
  // mantem a frase seca do caso sem opcoes, que e melhor que um convite vazio.
  return null;
}

@Injectable()
export class RecepcionarUseCase {
  constructor(private readonly recepcao: RecepcaoService) {}

  /**
   * A mensagem e so um cumprimento OU um pedido de ajuda?
   *
   * As duas coisas param aqui e nao chegam ao agente — a diferenca e a
   * RESPOSTA, e quem escolhe entre `saudar` e `oQuePossoFazer` e o roteador.
   */
  ehSaudacao(texto: string): boolean {
    const limpo = normalizar(texto);
    return RE_SAUDACAO.test(limpo) || RE_PEDIDO_DE_AJUDA.test(limpo);
  }

  /** "O que você faz?" — a pergunta que merece a lista de capacidades. */
  ehPedidoDeAjuda(texto: string): boolean {
    return RE_PEDIDO_DE_AJUDA.test(normalizar(texto));
  }

  /**
   * O menu do perfil, e a memoria dele para o numero que vier em seguida.
   *
   * O NOME VAI NA FRENTE, O CARGO NAO. "Bom dia, Yerlon!" reconhece quem
   * chegou; dizer "voce esta como estoque" seria confirmar cargo por
   * WhatsApp, e o perfil ja aparece inteiro no que e oferecido. Decisao do
   * Lucas em 15/09/2026.
   */
  saudar(
    _de: string,
    _perfil: PerfilDoCanal,
    nomeCompleto: string,
    agora = new Date(),
  ): { resposta: string; motivo: string } {
    // ======================================================================
    // NADA DE LISTA LOGO DE CARA — 29/09/2026.
    //
    // Pedido do Lucas: "Bom dia, Lucas! Em que posso ajudar hoje? ou algo
    // assim. Aí se a pessoa perguntar o que você pode fazer, aí você
    // passaria — mas não queria logo de cara".
    //
    // Quem abre conversa nao esta pedindo um catalogo de funcoes: esta
    // dizendo bom dia. Responder com o que se sabe fazer, sem ninguem ter
    // perguntado, e o reflexo de robo de atendimento — e obriga a pessoa a
    // ler uma lista para so entao escrever o que ela ja sabia que queria.
    //
    // O PERFIL DEIXOU DE IMPORTAR AQUI, e por isso vai com `_`: a frase e a
    // mesma para todo mundo. Ele volta a contar em `oQuePossoFazer`, que e
    // onde a diferenca entre gestao, vendedora e catalogo aparece.
    // ======================================================================
    return {
      resposta: `${this.abertura(nomeCompleto, agora)} Em que posso ajudar hoje?`,
      motivo: 'recepcao_saudacao',
    };
  }

  /**
   * "O que voce faz?" — aqui sim, a lista.
   *
   * A MESMA FRASE DO FORA-DO-ESCOPO, e nao por economia: as duas perguntas
   * terminam no mesmo lugar ("o que existe por aqui"), e responder diferente
   * faria parecer que ha dois conjuntos de capacidades.
   */
  oQuePossoFazer(
    perfil: PerfilDoCanal,
    nomeCompleto: string,
    agora = new Date(),
  ): { resposta: string; motivo: string } {
    const resumo = resumoDe(perfil);
    if (!resumo) {
      return {
        resposta: `${this.abertura(nomeCompleto, agora)} Como posso ajudar?`,
        motivo: 'recepcao_sem_opcoes',
      };
    }
    return { resposta: resumo, motivo: 'recepcao_menu' };
  }

  /**
   * "Isso eu não faço por aqui" — e, na mesma mensagem, o que eu faço.
   *
   * ==========================================================================
   * O CHAO DO CANAL DO CATALOGO DEIXOU DE SER A LISTA DE CATALOGOS.
   *
   * Em 21/09/2026 o Lucas, entrando como estoquista, perguntou "qual minha
   * carteira?" e recebeu os catalogos abertos. A lista nao estava errada por
   * defeito: ela ERA o chao — todo texto que as regras nao tratavam caia nela.
   *
   * Duas coisas se perdiam. A primeira, que aquilo nao existe neste canal. A
   * segunda, o que existe — e essa ele ja tinha, no menu, so que o menu so
   * aparecia para quem dizia "oi".
   *
   * NAO E UM ERRO, E UMA RESPOSTA. Nada de "nao entendi": a pessoa entendeu
   * o que escreveu, quem nao faz aquilo e o canal.
   * ==========================================================================
   */
  naoSeiFazer(
    de: string,
    perfil: PerfilDoCanal,
    nomeCompleto: string,
  ): { resposta: string; motivo: string } {
    const primeiro = nomeCompleto.trim().split(/\s+/)[0] ?? '';
    const abre = primeiro ? `${primeiro}, i` : 'I';
    return this.comMenu(
      de,
      perfil,
      `${abre}sso eu não faço por aqui.`,
      `${abre}sso eu não faço por aqui.`,
      'fora_do_escopo_menu',
      'fora_do_escopo_sem_opcoes',
    );
  }

  /**
   * O menu montado, com o cabecalho de quem chamou.
   *
   * SEM NENHUMA OPCAO NAO HA MENU. Nao deveria acontecer — o roteador so
   * chega aqui com alguem reconhecido —, mas um menu vazio seria pior que a
   * frase seca.
   */
  private comMenu(
    de: string,
    perfil: PerfilDoCanal,
    cabecalho: string,
    semOpcoes: string,
    motivoComMenu: string,
    motivoSemOpcoes: string,
  ): { resposta: string; motivo: string } {
    const resumo = resumoDe(perfil);
    if (!resumo) {
      return { resposta: semOpcoes, motivo: motivoSemOpcoes };
    }

    // ======================================================================
    // SEM `oferecer`: O MENU NUMERADO SAIU EM 29/09/2026.
    //
    // Pedido do Lucas: "vamos ser mais natural, sem essa pegada de chatbot, e
    // ser breve, sem muito textão". Seis linhas numeradas e um "responde o
    // número" sao a marca registrada de robo de atendimento — e a conversa
    // aqui e entre a casa e gente que trabalha nela.
    //
    // O QUE SE PERDE, e fica dito: o atalho de digitar "2". A capacidade
    // continua inteira — as ferramentas respondem a quem PERGUNTAR, como
    // sempre —, o que saiu foi a lista.
    //
    // POR ISSO `RecepcaoService`, `opcoesDe` e `escolhida` CONTINUAM DE PE e
    // nao foram apagados: um desenho futuro (botoes do WhatsApp, por exemplo)
    // reaproveita a mesma estrutura. O que nao pode acontecer e ARMAR a
    // escolha sem mostrar a lista — aí alguem que escrevesse "2" pensando em
    // outra coisa dispararia uma acao que ninguem ofereceu.
    // ======================================================================
    return {
      resposta: `${cabecalho} ${resumo}`,
      motivo: motivoComMenu,
    };
  }

  /** O numero digitado logo depois do menu. `null` quando nao era escolha. */
  escolhida(de: string, texto: string): OpcaoMenu | null {
    return this.recepcao.escolhida(de, texto);
  }

  /**
   * O menu deixou de valer — a pessoa passou para outro assunto.
   *
   * Sem isto, o menu ficaria de pe os dez minutos inteiros e disputaria o
   * numero com qualquer lista que os agentes mostrassem no meio do caminho.
   */
  esquecerMenu(de: string): void {
    this.recepcao.esquecer(de);
  }

  /**
   * As linhas de cada perfil.
   *
   * A ORDEM E A DO USO. Quem fotografa abre a conversa dez vezes por dia e
   * consulta preco de vez em quando; a vendedora olha venda antes de meta. O
   * numero mais usado fica sendo o 1.
   *
   * QUEM ACUMULA PAPEL VE AS DUAS COISAS: o ADM que tambem fotografa recebe
   * as linhas da gestao e, no fim, a do catalogo. Ate aqui o texto dele ia
   * inteiro para a Anastasia, e o caminho do catalogo so existia se ele
   * soubesse dizer a frase certa.
   */
  // ========================================================================
  // PARADO DESDE 29/09/2026 — NINGUEM CHAMA ESTE METODO HOJE.
  //
  // Ele montava o menu numerado, que saiu a pedido do Lucas ("mais natural,
  // sem pegada de chatbot"). Nao foi apagado de proposito, e o motivo e o
  // mesmo da triagem em 24/09: o desenho que vier pode reaproveitar isto —
  // botoes do WhatsApp, por exemplo, sao exatamente uma lista de rotulo mais
  // acao, que e a forma deste metodo.
  //
  // O QUE VALE PARA QUEM RELIGAR: religar isto sozinho nao basta e e
  // PERIGOSO. A escolha por numero so pode ser armada (`recepcao.oferecer`)
  // quando a lista for realmente MOSTRADA — armar sem mostrar faz um "2"
  // digitado por outro motivo virar uma acao que ninguem ofereceu.
  //
  // O texto de cada linha tambem segue vivo aqui de proposito: ele registra a
  // ORDEM DE USO de cada perfil, decidida em 15/09, que nenhum outro lugar
  // guarda.
  // ========================================================================
  private opcoesDe(perfil: PerfilDoCanal): OpcaoMenu[] {
    if (perfil.vendedora) {
      return [
        {
          rotulo: 'Minhas vendas',
          acao: frase('como estão minhas vendas hoje?'),
        },
        {
          rotulo: 'Minhas metas',
          acao: frase('como está a minha meta deste mês?'),
        },
        {
          rotulo: 'Minha carteira agora',
          acao: frase('como está minha carteira agora?'),
        },
        // ------------------------------------------------------------------
        // FORA DO MENU DESDE 25/09/2026, pelo mesmo motivo do "Leads para
        // encaminhar" da gestao: sem triagem, lead nao nasce.
        //
        // AQUI O ENGANO SERIA PIOR. A gestao que abre uma lista vazia conclui
        // que nao ha fila; a VENDEDORA que abre a dela conclui que a gestao
        // nao esta encaminhando nada para ela — e isso e uma queixa sobre
        // alguem, nascida de uma tela que so esta descrevendo um fluxo que
        // acabou.
        //
        // Volta junto com o convite da gestao, quando o fluxo novo existir.
        // {
        //   rotulo: 'Leads que me mandaram',
        //   acao: frase('quais leads encaminharam para mim?'),
        // },
        // ------------------------------------------------------------------
        {
          rotulo: 'Meus contatos de hoje',
          acao: frase('quais são os meus contatos de hoje?'),
        },
        {
          rotulo: 'Clientes sem comprar há tempo',
          acao: frase('quais clientes meus estão há mais tempo sem comprar?'),
        },
        {
          rotulo: 'Consultar peça ou preço',
          acao: frase('quero consultar o preço de uma peça'),
        },
      ];
    }

    if (perfil.gestao) {
      const opcoes: OpcaoMenu[] = [
        { rotulo: 'Panorama do dia', acao: frase('me dá o panorama de hoje') },
        {
          rotulo: 'Vendas por vendedora',
          acao: frase('como estão as vendas por vendedora hoje?'),
        },
        {
          rotulo: 'Funil de atendimentos',
          acao: frase('como está o funil de atendimentos?'),
        },
        {
          rotulo: 'Metas da equipe',
          acao: frase('como estão as metas da equipe neste mês?'),
        },
        // ------------------------------------------------------------------
        // FORA DO MENU DESDE 25/09/2026 — a triagem saiu do ar no dia
        // anterior, e com ela o unico caminho pelo qual lead NASCIA. O menu
        // continuava oferecendo uma porta que nao recebe mais ninguem: o que
        // aparecesse ali seria residuo antigo, ou algo vindo de um fluxo que
        // nos nao conhecemos — e as duas coisas enganam quem esta lendo.
        //
        // NAO APAGADO, e nao e por economia: quando o fluxo novo de cliente
        // for desenhado, o lead volta a nascer e esta linha volta com ele.
        //
        // AS FERRAMENTAS CONTINUAM DE PE. `panorama_de_leads`, `listar_leads`
        // e `encaminhar_lead` respondem normalmente a quem PERGUNTAR — o que
        // saiu foi o convite, nao a capacidade.
        // {
        //   rotulo: 'Leads para encaminhar',
        //   acao: frase('tem lead esperando encaminhamento?'),
        // },
        // ------------------------------------------------------------------
        {
          rotulo: 'Agenda de contatos',
          acao: frase('quais contatos estão agendados para hoje?'),
        },
      ];
      if (perfil.catalogo) {
        opcoes.push({
          rotulo: 'Enviar foto para o catálogo',
          acao: { tipo: 'catalogo_foto' },
        });
      }
      return opcoes;
    }

    if (perfil.catalogo) {
      return [
        {
          rotulo: 'Enviar foto para o catálogo',
          acao: { tipo: 'catalogo_foto' },
        },
        {
          rotulo: 'Consultar uma peça (código ou descrição)',
          acao: { tipo: 'catalogo_consulta' },
        },
        {
          rotulo: 'Ver os catálogos abertos',
          acao: { tipo: 'catalogo_abertos' },
        },
      ];
    }

    return [];
  }

  /**
   * "Bom dia, Yerlon!" — o cumprimento pelo relogio da loja e o primeiro
   * nome, que e como a equipe se trata no WhatsApp.
   *
   * O fuso vem do processo (`TZ=America/Sao_Paulo` no container) — ver a
   * memoria do fuso em Alpine. Errar aqui e dar bom dia as onze da noite.
   *
   * SEM NOME CADASTRADO, so o cumprimento: "Bom dia!" e melhor que
   * "Bom dia, !". O nome do perfil do WhatsApp nao serve de substituto — ele
   * e escolhido pelo dono do aparelho, e quem fala aqui e a casa.
   */
  private abertura(nome: string, agora: Date): string {
    const h = agora.getHours();
    const hora = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const primeiro = nome.trim().split(/\s+/)[0] ?? '';
    return primeiro ? `${hora}, ${primeiro}!` : `${hora}!`;
  }
}

function frase(texto: string): OpcaoMenu['acao'] {
  return { tipo: 'frase', texto };
}
