import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { PERMISSAO_GESTAO } from '../../../auth/application/use-cases/buscar-admin-por-telefone.use-case';
import { PermissionsService } from '../../../auth/application/permissions.service';
import { ADMIN_USER_REPOSITORY } from '../../../auth/domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../../auth/domain/ports/repositories/admin-user-repository.port';
import { SugerirVendedorasUseCase } from '../../../vendedoras/application/use-cases/sugerir-vendedoras.use-case';
import { blocoDoLead } from '../lead-em-texto';
import type { Lead } from '../../domain/ports/repositories/lead-repository.port';

/**
 * Avisa a GESTAO, no WhatsApp, que um lead terminou a triagem e espera
 * encaminhamento.
 *
 * POR QUE ATIVO, E NAO UMA TELA
 *
 * O admin nao fica olhando painel. Sem o empurrao, o lead entra no banco e
 * ninguem sabe — o que na pratica e o mesmo que nao ter registrado. A conversa
 * segue no MESMO chat: ele responde ali, e a Anastasia da gestao (que ja existe
 * e ja tem a ferramenta `avisar_vendedora`) cuida do resto.
 *
 * QUEM RECEBE
 *
 * Todo usuario com telefone cadastrado E permissao de gestao — o mesmo criterio
 * do `BuscarAdminPorTelefoneUseCase`, e nao uma segunda lista para esquecer de
 * atualizar. Vendedora com login no painel NAO recebe: ela tem linha em
 * `admin_users`, mas nao tem a permissao.
 *
 * NADA AQUI DERRUBA NADA. Se o WhatsApp estiver fora, o lead continua gravado e
 * em READY_FOR_ROUTING — o aviso e que se perde, e ele pode ser reenviado.
 */
@Injectable()
export class AvisarGestaoDeLeadUseCase {
  private readonly logger = new Logger(AvisarGestaoDeLeadUseCase.name);

  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly admins: IAdminUserRepository,
    private readonly permissoes: PermissionsService,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
    private readonly sugerir: SugerirVendedorasUseCase,
  ) {}

  /** Quantos avisos de fato sairam. Zero nao e erro — pode nao haver a quem avisar. */
  async execute(lead: Lead): Promise<number> {
    const destinatarios = await this.destinatarios();
    if (destinatarios.length === 0) {
      this.logger.warn(
        'Lead pronto para encaminhar, mas nenhum usuario de gestao tem telefone cadastrado.',
      );
      return 0;
    }

    const texto = this.mensagem(lead, await this.sugestao(lead));
    let enviados = 0;

    for (const admin of destinatarios) {
      try {
        // `resolverChatId` porque o numero cadastrado nem sempre e o chatId: o
        // WhatsApp guarda contas antigas em outro identificador. Devolve null
        // quando o numero nao tem WhatsApp — cadastro certo, conta inexistente.
        const chatId = await this.whatsapp.resolverChatId(
          admin.telefone as string,
        );
        if (!chatId) {
          this.logger.warn(
            `Telefone de ${admin.nome} nao corresponde a uma conta de WhatsApp.`,
          );
          continue;
        }
        await this.whatsapp.enviarTexto(chatId, texto);
        enviados++;
      } catch (err) {
        // Um destinatario com problema nao pode calar os outros.
        this.logger.error(
          `Falha ao avisar a gestao (${admin.nome}) do lead ${lead.id}: ${String(err)}`,
        );
      }
    }
    return enviados;
  }

  private async destinatarios() {
    const todos = await this.admins.listarTodos();
    const comTelefone = todos.filter((a) => a.telefone);

    const aprovados = [];
    for (const admin of comTelefone) {
      if (await this.permissoes.possui(admin.role, PERMISSAO_GESTAO)) {
        aprovados.push(admin);
      }
    }
    return aprovados;
  }

  /**
   * Quem eu sugeriria para este lead — nome e o porque, em uma linha.
   *
   * ==========================================================================
   * CALCULADA AQUI, NA HORA DE AVISAR, E NAO GRAVADA NA TRIAGEM.
   *
   * O ranqueamento parte de quem esta DISPONIVEL. Congelar o codigo quando a
   * conversa terminou faria a mensagem sugerir quem entrou de folga no meio do
   * caminho — e quem le nao tem como saber que o dado envelheceu. Aqui a lista
   * de disponiveis e a de agora, no segundo em que a mensagem sai.
   *
   * O CODIGO VINDO DE FORA MANDA, quando existe: se alguem gravou
   * `vendedoraSugeridaCodigo` no lead, foi uma escolha deliberada de quem
   * chamou a API, e sobrepor isso com o meu palpite seria ignorar o pedido.
   * Nesse caso eu so resolvo o codigo em NOME — codigo solto no WhatsApp
   * ("SEED-VD02") obriga quem le a lembrar de cor de quem e.
   *
   * NUNCA DERRUBA O AVISO. Um lead sem sugestao ainda vale a mensagem, e a
   * pergunta do fim ("para qual vendedora encaminho?") continua respondivel.
   * Falhar aqui e perder uma linha, nunca o aviso.
   * ==========================================================================
   */
  private async sugestao(lead: Lead): Promise<string | null> {
    try {
      // Ranqueia so quando NAO ha codigo pedido: com um codigo em maos, o
      // score nao decide nada e a chamada seria paga a toa.
      //
      // A ESPECIALIDADE E O TEXTO CRU do que ela procura. O casamento e
      // parcial nos dois sentidos — "anel" casa com "aneis de noivado" —,
      // entao a frase da triagem serve como esta.
      const escolhida = lead.vendedoraSugeridaCodigo
        ? (await this.sugerir.execute({ limit: 10 })).find(
            (v) => v.codigoErp === lead.vendedoraSugeridaCodigo,
          )
        : (
            await this.sugerir.execute({
              clienteId: lead.clienteId,
              especialidade: lead.produtosDesejados,
              limit: 1,
            })
          )[0];

      // Codigo pedido de fora que nao esta entre as disponiveis: imprime o
      // codigo mesmo. Trocar em silencio por outra pessoa seria pior que uma
      // linha feia.
      if (!escolhida) {
        return lead.vendedoraSugeridaCodigo ?? null;
      }

      const porque = escolhida.motivos.join(', ');
      return porque ? `${escolhida.nome} (${porque})` : escolhida.nome;
    } catch (err) {
      this.logger.warn(
        `Sugestao de vendedora falhou para o lead ${lead.id} — aviso segue sem ela: ${String(err)}`,
      );
      return null;
    }
  }

  /**
   * A mensagem. Curta de proposito: quem le esta no WhatsApp, no meio do dia.
   *
   * NAO VAI O TELEFONE DA CLIENTE. Ele esta no CRM para quem for atender; num
   * aviso ele so serviria para ser encaminhado adiante sem controle.
   */
  private mensagem(lead: Lead, sugestao: string | null): string {
    // O CORPO E COMPARTILHADO com o aviso que a vendedora recebe. Montar cada
    // um a parte faria a vendedora receber menos do que o ADM leu no dia em
    // que alguem acrescentasse um campo de um lado so.
    const linhas = blocoDoLead(lead);

    if (sugestao) {
      linhas.push(``, `Sugestão: ${sugestao}`);
    }

    linhas.push(``, `Para qual vendedora encaminho?`);
    return linhas.join('\n');
  }
}
