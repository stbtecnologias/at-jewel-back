import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { PERMISSAO_GESTAO } from '../../../auth/application/use-cases/buscar-admin-por-telefone.use-case';
import { PermissionsService } from '../../../auth/application/permissions.service';
import { ADMIN_USER_REPOSITORY } from '../../../auth/domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../../auth/domain/ports/repositories/admin-user-repository.port';
import type { Lead } from '../../domain/ports/repositories/lead-repository.port';

const OCASIAO_LEGIVEL: Record<string, string> = {
  CASAMENTO: 'casamento',
  NOIVADO: 'noivado',
  ANIVERSARIO: 'aniversário',
  FORMATURA: 'formatura',
  DATA_COMEMORATIVA: 'data comemorativa',
  AUTOPRESENTE: 'presente para si',
  OUTRO: 'outra ocasião',
};

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

    const texto = this.mensagem(lead);
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
   * A mensagem. Curta de proposito: quem le esta no WhatsApp, no meio do dia.
   *
   * NAO VAI O TELEFONE DA CLIENTE. Ele esta no CRM para quem for atender; num
   * aviso ele so serviria para ser encaminhado adiante sem controle.
   */
  private mensagem(lead: Lead): string {
    const nome = lead.nome?.trim() || 'Cliente sem nome informado';
    const linhas = [`Chegou um lead novo.`, ``, nome];

    const detalhe: string[] = [];
    if (lead.produtosDesejados) detalhe.push(lead.produtosDesejados);
    if (lead.ocasiao) {
      detalhe.push(
        `para ${OCASIAO_LEGIVEL[lead.ocasiao] ?? lead.ocasiao.toLowerCase()}`,
      );
    }
    if (detalhe.length) linhas.push(detalhe.join(' — '));

    if (lead.origemContato) linhas.push(`Veio de: ${lead.origemContato}`);
    if (lead.clienteId) linhas.push('Já é cliente da casa.');

    if (lead.resumoTriagem) {
      linhas.push(``, lead.resumoTriagem.trim());
    }

    if (lead.vendedoraSugeridaCodigo) {
      linhas.push(``, `Sugestão da triagem: ${lead.vendedoraSugeridaCodigo}`);
    }

    linhas.push(``, `Para qual vendedora encaminho?`);
    return linhas.join('\n');
  }
}
