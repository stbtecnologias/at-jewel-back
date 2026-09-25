import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { ATENDIMENTO_REPOSITORY } from '../../../atendimentos/domain/ports/injection-tokens';
import type { IAtendimentoRepository } from '../../../atendimentos/domain/ports/repositories/atendimento-repository.port';
import type { OcasiaoAtendimento } from '../../../atendimentos/domain/entities/enums';
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
 * A TRIAGEM ACABOU E A CLIENTE JA TEM CADASTRO: vira ATENDIMENTO — 23/09/2026.
 *
 * ==========================================================================
 * A OBSERVACAO DO LUCAS QUE MUDOU O DESENHO:
 *
 *   "o lead geralmente usamos para novos clientes, sem cadastro. no caso
 *    desse cliente que tem cadastro, o final poderia virar o atendimento"
 *
 * Esta certo, e resolve pela raiz um problema que a gente vinha remendando.
 * A primeira versao so gravava a vendedora no LEAD — e `leads.encaminhar`
 * FECHA o lead, o que liberava o numero. A mensagem seguinte da cliente nao
 * achava lead aberto, abria outro e zerava a memoria da conversa: ela era
 * cumprimentada do zero no meio da propria frase.
 *
 * Aconteceu duas vezes, e a segunda mostrou que nao era questao de ajustar a
 * hora do encaminhamento: as 15:37 a Anastasia se despediu E fez uma pergunta
 * ("ha algo em particular que voce gostaria que eu adiantasse a ela?"). O
 * "que ela entrasse em contato comigo as 17hrs" caiu num lead novo e orfao —
 * a informacao mais acionavel da conversa inteira, perdida.
 *
 * SEMPRE VAI EXISTIR UM TURNO DEPOIS DO ENCERRAMENTO. O erro nao era a hora;
 * era o lead ser o veiculo errado para quem ja tem cadastro.
 * ==========================================================================
 *
 * O QUE MUDA: a conversa migra para o atendimento, que e onde ela deveria
 * estar. O lead fecha porque o assunto mudou de casa, e nao porque acabou.
 *
 * A ETAPA NASCE `PRIMEIRO_CONTATO` e anda sozinha — `vw_atendimentos_auditoria`
 * a deriva do que aconteceu, e nao ha estado gravado para desatualizar.
 */

/** O que aconteceu. `ATENDEU` e o unico que tira o lead da fila. */
export type ResultadoDaCarteira =
  | {
      status: 'ATENDEU';
      vendedoraNome: string;
      atendimentoId: string;
      /** Ja havia um atendimento aberto para esta cliente, e entrou nele. */
      reusou: boolean;
      avisada: boolean;
    }
  /** O lead nao tem cadastro atras, ou a cliente nao tem dona. */
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
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly atendimentos: IAtendimentoRepository,
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

    const { atendimentoId, reusou } = await this.abrirOuReusar(lead, dona.id);

    // O QUE A TRIAGEM DESCOBRIU VIRA A PRIMEIRA INTERACAO. Sem isto o
    // atendimento nasceria mudo: a vendedora abriria a tela e nao veria por
    // que aquela cliente esta ali.
    //
    // `ABERTURA` (migracao 64) e nao `ENCAMINHADO`: os dois acontecem no mesmo
    // minuto e, compartilhando o tipo, a linha do tempo desenhava duas
    // bolinhas com a MESMA frase. Sao acontecimentos DIFERENTES — o lead foi
    // encaminhado E o atendimento comecou — e agora cada um diz o que e.
    await this.atendimentos.criarInteracao({
      atendimentoId,
      tipo: 'ABERTURA',
      ocorridoEm: new Date(),
      relato: this.relatoDaTriagem(lead),
    });

    const avisada = await this.avisar(dona.whatsappInterno, lead);

    // O LEAD FECHA PORQUE O ASSUNTO MUDOU DE CASA, e nao porque acabou. Daqui
    // em diante a conversa e do atendimento; deixar o lead aberto faria a
    // proxima mensagem continuar uma triagem que ja terminou.
    await this.leads.encaminhar(lead.id, dona.codigoErp as string);

    this.logger.log(
      `Lead ${lead.id} virou atendimento ${atendimentoId} de ${dona.codigoErp}` +
        (reusou ? ' (reusou o aberto)' : '') +
        (avisada ? '.' : ' — sem aviso, ela nao tem WhatsApp alcancavel.'),
    );

    return {
      status: 'ATENDEU',
      vendedoraNome: dona.nome,
      atendimentoId,
      reusou,
      avisada,
    };
  }

  /**
   * REUSA O ATENDIMENTO ABERTO quando ha um. Nao e escolha de estilo: existe o
   * indice parcial `uq_atendimento_aberto_por_cliente`, e abrir um segundo
   * levantaria violacao de unicidade.
   *
   * Decisao do Lucas entre reusar e recusar: reusar. E a mesma cliente com a
   * mesma vendedora, e um segundo episodio simultaneo e justamente o que
   * aquela trava existe para impedir.
   *
   * A OCASIAO SO PREENCHE SE ESTIVER VAZIA (`completarOcasiaoSeVazia`): o
   * atendimento pode ter nascido de uma venda de aniversario, e a triagem de
   * agora falar de casamento. Sobrescrever apagaria o motivo original.
   */
  private async abrirOuReusar(
    lead: Lead,
    vendedoraId: string,
  ): Promise<{ atendimentoId: string; reusou: boolean }> {
    const clienteId = lead.clienteId as string;
    const ocasiao = (lead.ocasiao ?? null) as OcasiaoAtendimento | null;

    const aberto = await this.atendimentos.buscarAbertoPorCliente(clienteId);
    if (aberto) {
      if (ocasiao) await this.atendimentos.completarOcasiaoSeVazia(aberto.id, ocasiao);
      return { atendimentoId: aberto.id, reusou: true };
    }

    const novo = await this.atendimentos.abrir({ clienteId, vendedoraId, ocasiao });
    return { atendimentoId: novo.id, reusou: false };
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
    if (!vendedora?.codigoErp || !vendedora.id) return null;

    return vendedora as typeof vendedora & { id: string };
  }

  /** O resumo da triagem, ou o que der, para o atendimento nao nascer mudo. */
  private relatoDaTriagem(lead: Lead): string {
    const resumo = lead.resumoTriagem?.trim();
    if (resumo) return resumo;

    const partes = [lead.produtosDesejados, lead.ocasiao].filter(Boolean);
    return partes.length
      ? `Chegou pela triagem: ${partes.join(' — ')}.`
      : 'Chegou pela triagem do WhatsApp.';
  }

  /**
   * O aviso no WhatsApp pessoal dela. Devolve se saiu, e NUNCA levanta erro.
   *
   * A FALHA NAO CANCELA NADA: hoje 19 das 23 vendedoras nao tem WhatsApp
   * pessoal cadastrado. Se isso barrasse, a regra da carteira nao valeria para
   * quase ninguem — e o atendimento e o registro que importa, nao a mensagem.
   * Quem fica sabendo e a gestao.
   */
  private async avisar(whatsapp: string | null, lead: Lead): Promise<boolean> {
    if (!whatsapp) return false;

    try {
      const chatId = await this.whatsapp.resolverChatId(whatsapp);
      if (!chatId) return false;

      // Numero da Elena: quem recebe e a VENDEDORA dona da carteira.
      await this.whatsapp.enviarTexto(chatId, this.mensagem(lead), 'ELENA');
      return true;
    } catch (err) {
      this.logger.error(
        `Falha ao avisar a dona do lead ${lead.id}: ${String(err)}`,
      );
      return false;
    }
  }

  /**
   * A OFERTA DE AGENDAR E O PONTO DA MENSAGEM, e a razao e do Lucas: "se ficar
   * apenas como um aviso, ela pode ligar e nem passar pelo atendimento".
   *
   * Aqui o atendimento JA existe, entao a resposta dela cai direto nele: a
   * Elena chama `agendarContato` e a interacao `AGENDAMENTO` entra no mesmo
   * episodio — sem o `E_LEAD` de 22/09, quando agendar exigia um cliente que o
   * lead nao tinha.
   */
  private mensagem(lead: Lead): string {
    const linhas = blocoDoLead(lead);
    linhas.push(`Entre em contato: ${telefoneLegivel(lead.whatsapp)}`);
    linhas.push(
      ``,
      `Já abri o atendimento. Quer que eu registre o contato na sua agenda? ` +
        `Me diga o horário que você pretende falar com ela e eu te lembro.`,
    );
    return linhas.join('\n');
  }
}
