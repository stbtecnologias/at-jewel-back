import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import {
  blocoDoLead,
  telefoneLegivel,
} from '../../../leads/application/lead-em-texto';
import { LEAD_REPOSITORY } from '../../../leads/domain/ports/injection-tokens';
import type {
  ILeadRepository,
  Lead,
} from '../../../leads/domain/ports/repositories/lead-repository.port';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import { ResolverVendedoraPorNomeUseCase } from './resolver-vendedora-por-nome.use-case';

/** Teto da fila lida. Fila de leads da casa nao chega perto disso. */
const LIMITE_FILA = 20;

export interface EncaminharLeadInput {
  /** Nome (ou parte) da vendedora, como o ADM escreveu. */
  vendedora: string;
  /**
   * Nome do lead, quando o ADM disser qual. Opcional: com um so esperando,
   * "manda pro Thiago" nao precisa repetir de quem se trata.
   */
  lead?: string | null;
  /**
   * Horario combinado, EM TEXTO LIVRE, como o ADM falou — "hoje as 14h",
   * "amanha de manha", "depois das 18h".
   *
   * NAO E AGENDAMENTO, e a diferenca importa: nada aqui vira relogio, nada
   * cobra a vendedora depois. E um recado, e vai como recado. O fluxo de
   * cliente da casa e que agenda de verdade, porque la existe atendimento
   * para pendurar a cobranca.
   *
   * EXISTE PORQUE SEM ELE O HORARIO SUMIA. O ADM responde ao aviso com
   * "encaminha para a Marina, hoje as 14h" — sem um lugar para isso, a
   * frase e lida, o encaminhamento acontece, e a vendedora recebe a peca
   * sem a hora. Nada avisa que uma parte do pedido foi ignorada.
   */
  quando?: string | null;
}

/**
 * Resultado fechado, para a Anastasia virar UMA frase em vez de erro na tela.
 * Nenhuma variante carrega telefone de cliente.
 */
export type ResultadoEncaminhamento =
  | { status: 'ENCAMINHADO'; leadNome: string; vendedoraNome: string }
  | { status: 'NENHUM_LEAD' }
  | { status: 'LEAD_AMBIGUO'; nomes: string[] }
  | { status: 'LEAD_NAO_ENCONTRADO'; termo: string; nomes: string[] }
  | { status: 'VENDEDORA_NAO_ENCONTRADA'; termo: string; sugestoes: string[] }
  | { status: 'VENDEDORA_AMBIGUA'; nomes: string[] }
  | { status: 'VENDEDORA_SEM_CODIGO'; vendedoraNome: string }
  | { status: 'VENDEDORA_SEM_WHATSAPP'; vendedoraNome: string }
  | { status: 'NUMERO_SEM_WHATSAPP'; vendedoraNome: string }
  | { status: 'FALHA_ENVIO'; vendedoraNome: string };

/**
 * "Manda pro Thiago" — o passo que faltava entre o aviso e a vendedora.
 *
 * ==========================================================================
 * POR QUE ISTO NAO E A `avisar_vendedora` QUE JA EXISTE.
 *
 * Aquela resolve o cliente na tabela `clientes` e descobre a vendedora pela
 * CARTEIRA dele — o ADM nem escolhe. Serve para cliente da casa.
 *
 * Lead novo nao tem linha em `clientes` (cadastro e do ERP, e ninguem
 * cadastrou ainda) e nao tem carteira. Chamar aquela ferramenta aqui devolve
 * CLIENTE_NAO_ENCONTRADO — que era exatamente o que acontecia: o aviso
 * terminava perguntando "para qual vendedora encaminho?" e a resposta nao
 * tinha para onde ir.
 * ==========================================================================
 *
 * SEM AGENDAMENTO, por decisao do Lucas em 03/09/2026. O fluxo de cliente cria
 * atendimento e agenda a cobranca do relato; aqui vai texto puro. A
 * consequencia, que e real: ninguem vai perguntar a vendedora como foi, e o
 * relogio do SLA nao comeca — ele mora em `clientes_perfil`, e ainda nao ha
 * cliente. O acompanhamento volta a existir quando o lead virar cadastro.
 *
 * O TELEFONE VAI, e aqui ele TEM de ir. No aviso da gestao ele e omitido de
 * proposito, porque o ADM nao liga para ninguem e o numero solto so serviria
 * para ser repassado adiante. A vendedora e o oposto: ela precisa ligar, e o
 * numero do lead esta cifrado numa tabela sem tela. Sem ele, o pedido "entre
 * em contato" nao tem como ser cumprido.
 *
 * O LEAD FECHA no encaminhamento (ver `encaminhar` no repositorio), o que
 * libera o numero para um proximo atendimento. Encaminhar duas vezes por
 * engano nao duplica: na segunda ele nao esta mais na fila.
 */
@Injectable()
export class EncaminharLeadUseCase {
  private readonly logger = new Logger(EncaminharLeadUseCase.name);

  constructor(
    @Inject(LEAD_REPOSITORY)
    private readonly leads: ILeadRepository,
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
    private readonly resolverVendedora: ResolverVendedoraPorNomeUseCase,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
  ) {}

  async execute(input: EncaminharLeadInput): Promise<ResultadoEncaminhamento> {
    const fila = await this.leads.listarAguardandoGestao(LIMITE_FILA);
    const escolha = this.escolherLead(fila, input.lead);
    if (escolha.status !== 'ACHOU') return escolha.erro;
    const lead = escolha.lead;

    // A VENDEDORA VEM DEPOIS DO LEAD de proposito: sem lead na fila, perguntar
    // "qual Thiago?" seria cobrar uma escolha que nao vai a lugar nenhum.
    const alvo = await this.resolverVendedora.execute(input.vendedora);
    if (alvo.status === 'NAO_ENCONTRADA') {
      return {
        status: 'VENDEDORA_NAO_ENCONTRADA',
        termo: input.vendedora,
        sugestoes: alvo.sugestoes,
      };
    }
    if (alvo.status === 'AMBIGUA') {
      return { status: 'VENDEDORA_AMBIGUA', nomes: alvo.nomes };
    }

    if (!alvo.codigoErp) {
      // `encaminhar` grava o CODIGO no lead, nao o id. Sem codigo nao ha o que
      // gravar, e mandar a mensagem sem registrar deixaria o lead na fila para
      // outra pessoa encaminhar de novo.
      return { status: 'VENDEDORA_SEM_CODIGO', vendedoraNome: alvo.nome };
    }

    const vendedora = await this.vendedoras.buscarPorId(alvo.id);
    if (!vendedora?.whatsappInterno) {
      return { status: 'VENDEDORA_SEM_WHATSAPP', vendedoraNome: alvo.nome };
    }

    // Pergunta ao WAHA qual e o chatId real. Concatenar o telefone entrega a
    // mensagem no vazio quando a conta e anterior ao nono digito.
    let chatId: string | null;
    try {
      chatId = await this.whatsapp.resolverChatId(vendedora.whatsappInterno);
    } catch (err) {
      this.logger.error(
        `Falha ao resolver o chatId da vendedora ${vendedora.id}: ${err instanceof Error ? err.message : err}`,
      );
      return { status: 'FALHA_ENVIO', vendedoraNome: alvo.nome };
    }
    if (!chatId) {
      return { status: 'NUMERO_SEM_WHATSAPP', vendedoraNome: alvo.nome };
    }

    // ENVIA ANTES DE GRAVAR. `encaminhar` FECHA o lead e o tira da fila; se
    // gravasse primeiro e o WhatsApp falhasse, o lead sairia da fila sem
    // ninguem ter sido avisado — e nenhuma tela mostraria isso. Falhando o
    // envio, ele continua esperando e da para tentar de novo.
    try {
      await this.whatsapp.enviarTexto(
        chatId,
        this.mensagem(lead, input.quando),
      );
    } catch (err) {
      this.logger.error(
        `Falha ao encaminhar o lead ${lead.id} para ${alvo.nome}: ${err instanceof Error ? err.message : err}`,
      );
      return { status: 'FALHA_ENVIO', vendedoraNome: alvo.nome };
    }

    await this.leads.encaminhar(lead.id, alvo.codigoErp);
    this.logger.log(`Lead ${lead.id} encaminhado para ${alvo.codigoErp}.`);

    return {
      status: 'ENCAMINHADO',
      leadNome: lead.nome?.trim() || 'o lead',
      vendedoraNome: alvo.nome,
    };
  }

  /**
   * Qual lead o ADM quis dizer.
   *
   * COM UM SO NA FILA, NAO PERGUNTA. A resposta ao aviso e "manda pro Thiago",
   * e exigir o nome do cliente de novo seria cobrar o que acabou de ser lido.
   *
   * COM DOIS OU MAIS, PERGUNTA E DIZ OS NOMES. "Qual deles?" sozinho e uma
   * pergunta sem resposta possivel — a regra que ja custou tres defeitos em
   * 31/08.
   */
  private escolherLead(
    fila: Lead[],
    termo?: string | null,
  ):
    | { status: 'ACHOU'; lead: Lead }
    | { status: 'ERRO'; erro: ResultadoEncaminhamento } {
    if (fila.length === 0) {
      return { status: 'ERRO', erro: { status: 'NENHUM_LEAD' } };
    }

    const busca = normalizar(termo ?? '');
    if (!busca) {
      return fila.length === 1
        ? { status: 'ACHOU', lead: fila[0] }
        : {
            status: 'ERRO',
            erro: { status: 'LEAD_AMBIGUO', nomes: nomesDe(fila) },
          };
    }

    const casam = fila.filter((l) => normalizar(l.nome ?? '').includes(busca));
    if (casam.length === 1) return { status: 'ACHOU', lead: casam[0] };
    if (casam.length > 1) {
      return {
        status: 'ERRO',
        erro: { status: 'LEAD_AMBIGUO', nomes: nomesDe(casam) },
      };
    }

    return {
      status: 'ERRO',
      erro: {
        status: 'LEAD_NAO_ENCONTRADO',
        termo: termo ?? '',
        nomes: nomesDe(fila),
      },
    };
  }

  /**
   * O texto que a vendedora recebe: o mesmo paragrafo que a gestao leu, mais o
   * telefone. Sem a linha de sugestao — ela e conversa entre o sistema e o ADM,
   * e chegar na vendedora soaria como se alguem tivesse duvidado dela.
   */
  private mensagem(lead: Lead, quando?: string | null): string {
    const linhas = blocoDoLead(lead);

    // O HORARIO ANTES DO TELEFONE: ela le "quando" e ja tem o "como" na
    // linha seguinte. Invertido, o numero fica orfao no meio do texto.
    const combinado = quando?.trim();
    if (combinado) linhas.push(`Pediu contato ${combinado}.`);

    linhas.push(`Entre em contato: ${telefoneLegivel(lead.whatsapp)}`);
    return linhas.join('\n');
  }
}

function nomesDe(leads: Lead[]): string[] {
  return leads.map((l) => l.nome?.trim() || 'sem nome informado');
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
