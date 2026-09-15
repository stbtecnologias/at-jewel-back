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
  /^(oi+|ola|opa|eae|e ai|hey|hi|hello|alo|bom dia|boa tarde|boa noite|menu|ajuda|opcoes|comecar|inicio|start)( (tudo bem|tudo bom|td bem|beleza|blz))?$/;

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

@Injectable()
export class RecepcionarUseCase {
  constructor(private readonly recepcao: RecepcaoService) {}

  /** A mensagem e so um cumprimento (ou um pedido de ajuda)? */
  ehSaudacao(texto: string): boolean {
    return RE_SAUDACAO.test(normalizar(texto));
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
    de: string,
    perfil: PerfilDoCanal,
    nomeCompleto: string,
    agora = new Date(),
  ): { resposta: string; motivo: string } {
    const opcoes = this.opcoesDe(perfil);

    // SEM NENHUMA OPCAO NAO HA MENU. Nao deveria acontecer — o roteador so
    // chega aqui com alguem reconhecido —, mas um menu vazio seria pior que
    // a saudacao seca.
    if (opcoes.length === 0) {
      return {
        resposta: `${this.abertura(nomeCompleto, agora)} Como posso ajudar?`,
        motivo: 'recepcao_sem_opcoes',
      };
    }

    this.recepcao.oferecer(de, opcoes);

    const linhas = opcoes.map((o, i) => `${i + 1} — ${o.rotulo}`);
    return {
      resposta: [
        `${this.abertura(nomeCompleto, agora)} Aqui eu te ajudo com:`,
        linhas.join('\n'),
        'Responde o número ou me diz o que precisa.',
      ].join('\n\n'),
      motivo: 'recepcao_menu',
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
          rotulo: 'Metas da equipe',
          acao: frase('como estão as metas da equipe neste mês?'),
        },
        {
          rotulo: 'Leads para encaminhar',
          acao: frase('tem lead esperando encaminhamento?'),
        },
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
