import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import { LEAD_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  ILeadRepository,
  Lead,
} from '../../domain/ports/repositories/lead-repository.port';
import { blocoDoLead, telefoneLegivel } from '../lead-em-texto';

/**
 * A CLIENTE VOLTOU, E ELA JA TEM DONA — 23/09/2026.
 *
 * ==========================================================================
 * A REGRA E DO LUCAS, e ela e curta: "se o cliente tem uma vendedora
 * associada, e tudo com ela". Trocar de vendedora existe, mas e caso muito
 * especifico — nao e o caminho padrao.
 *
 * Ate aqui a carteira era um VOTO. O `SugerirVendedorasUseCase` ja lia
 * `cliente.vendedoraCodigoErp` e somava `PESOS_SUGESTAO.RELACIONAMENTO` com o
 * motivo "ja atendeu este cliente" — mas era um item de ranking, que podia
 * perder para especialidade ou disponibilidade, e a decisao final continuava
 * com a gestao.
 *
 * Aqui a carteira deixa de ser voto e vira REGRA. A gestao passa a ser
 * INFORMADA, e nao consultada.
 * ==========================================================================
 *
 * POR QUE ISTO VIVE NO MODULO DE LEADS, e nao reusa o `EncaminharLeadUseCase`
 * do modulo de atendimentos: aquele resolve a vendedora por NOME, com
 * desambiguacao, porque nasceu para a ferramenta da gestao ("encaminha para a
 * Helena"). Aqui o codigo ja vem do cadastro — nao ha nome para adivinhar. E
 * `atendimentos` ja importa `leads`; a volta criaria ciclo de modulo.
 */

/** O que aconteceu com a tentativa. `ENCAMINHADO` e o unico que tira da fila. */
export type ResultadoDaCarteira =
  | { status: 'ENCAMINHADO'; vendedoraNome: string; avisada: boolean }
  /** O lead nao tem cadastro de cliente atras, ou a cliente nao tem dona. */
  | { status: 'SEM_DONA' }
  /** Tem dona, mas ela nao pode receber agora. A gestao decide, sabendo disso. */
  | { status: 'DONA_INDISPONIVEL'; vendedoraNome: string; motivo: string };

@Injectable()
export class EncaminharPelaCarteiraUseCase {
  private readonly logger = new Logger(EncaminharPelaCarteiraUseCase.name);

  constructor(
    @Inject(LEAD_REPOSITORY)
    private readonly leads: ILeadRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
  ) {}

  async execute(lead: Lead): Promise<ResultadoDaCarteira> {
    const dona = await this.donaDaCliente(lead);
    if (!dona) return { status: 'SEM_DONA' };

    if (!dona.ativo) {
      return {
        status: 'DONA_INDISPONIVEL',
        vendedoraNome: dona.nome,
        motivo: 'está inativa',
      };
    }

    // AVISA ANTES DE GRAVAR, pela mesma razao do `EncaminharLeadUseCase`:
    // `encaminhar` FECHA o lead e o tira da fila da gestao. Gravando primeiro
    // e falhando o envio, o lead sairia da fila sem ninguem ter sido avisado —
    // e nenhuma tela mostraria isso.
    //
    // A DIFERENCA e que aqui a falha de envio NAO cancela o encaminhamento: a
    // carteira e dela de qualquer jeito, e o lead na lista dela e melhor que o
    // lead na fila de ninguem. Hoje 19 das 23 vendedoras nao tem WhatsApp
    // pessoal cadastrado — se isso barrasse, a regra nao valeria para quase
    // ninguem. Quem fica sabendo e a gestao, pelo `avisada: false`.
    const avisada = await this.avisar(dona.whatsappInterno, lead);

    await this.leads.encaminhar(lead.id, dona.codigoErp as string);
    this.logger.log(
      `Lead ${lead.id} encaminhado pela CARTEIRA para ${dona.codigoErp}` +
        (avisada ? '.' : ' — sem aviso, ela nao tem WhatsApp alcancavel.'),
    );

    return { status: 'ENCAMINHADO', vendedoraNome: dona.nome, avisada };
  }

  /**
   * A dona, quando existe. Tres coisas precisam estar no lugar: o lead ligado
   * a um cliente, o cliente com codigo de vendedora, e a vendedora existindo.
   *
   * Sem `codigoErp` ela nao serve nem que exista: e a coluna que o
   * `leads.encaminhar` grava, e o CHECK `chk_lead_encaminhamento` exige.
   */
  private async donaDaCliente(lead: Lead) {
    if (!lead.clienteId) return null;

    const cliente = await this.clientes.buscarPorId(lead.clienteId);
    const codigo = cliente?.vendedoraCodigoErp?.trim();
    if (!codigo) return null;

    const vendedora = await this.vendedoras.buscarPorCodigoErp(codigo);
    if (!vendedora?.codigoErp) return null;

    return vendedora;
  }

  /**
   * O aviso no WhatsApp pessoal dela. Devolve se saiu, e nunca levanta erro —
   * ver o comentario do `execute` sobre por que a falha nao cancela nada.
   *
   * O TEXTO E O MESMO do encaminhamento manual, mais a oferta de agendar. A
   * oferta e segura AQUI e so aqui: `atendimentos.cliente_id` e NOT NULL,
   * entao agendar exige cliente — foi o defeito de 22/09, quando a Elena
   * ofereceu agendar um lead que nao tinha cadastro. Neste caminho o lead
   * SEMPRE tem cliente, porque e a propria condicao que o dispara.
   *
   * E a oferta tem uma razao de negocio, do Lucas: sem ela a vendedora liga e
   * o contato nunca passa por um atendimento — "se ficar apenas como um aviso,
   * ela pode ligar e nem passar pelo atendimento". Respondendo o horario, a
   * Elena chama `agendarContato`, que ABRE o atendimento e grava a interacao
   * `AGENDAMENTO`. A trajetoria comeca registrada, e vira ponto na timeline.
   */
  private async avisar(whatsapp: string | null, lead: Lead): Promise<boolean> {
    if (!whatsapp) return false;

    try {
      const chatId = await this.whatsapp.resolverChatId(whatsapp);
      if (!chatId) return false;

      await this.whatsapp.enviarTexto(chatId, this.mensagem(lead));
      return true;
    } catch (err) {
      this.logger.error(
        `Falha ao avisar a dona do lead ${lead.id}: ${String(err)}`,
      );
      return false;
    }
  }

  private mensagem(lead: Lead): string {
    const linhas = blocoDoLead(lead);
    linhas.push(`Entre em contato: ${telefoneLegivel(lead.whatsapp)}`);
    linhas.push(
      ``,
      `Quer que eu registre esse contato na sua agenda? Me diga o horário que ` +
        `você pretende falar com ela e eu te lembro.`,
    );
    return linhas.join('\n');
  }
}
