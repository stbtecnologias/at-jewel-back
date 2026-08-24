import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FerramentasVendedoraService } from '../../../atendimentos/application/ferramentas-vendedora.service';
import { VENDA_REPOSITORY } from '../../../vendas/domain/ports/injection-tokens';
import type { IVendaRepository } from '../../../vendas/domain/ports/repositories/venda-repository.port';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import type { MensagemAgente } from '../../domain/entities/conversa.entity';
import {
  AGENTE_PROMPTS_REPOSITORY,
  LLM_CLIENT,
} from '../../domain/ports/injection-tokens';
import type {
  ChatComFerramentasResultado,
  ILlmClient,
} from '../../domain/ports/llm-client.port';
import type { IAgentePromptsRepository } from '../../domain/ports/repositories/agente-prompts-repository.port';
import { ELENA_SYSTEM } from '../personas';
import type { ContextoAgente, SolicitanteChat } from './chat-anastasia.use-case';
import { sanitizarMensagens } from './chat-anastasia.use-case';

/**
 * A Elena do painel.
 *
 * ==========================================================================
 * ATE 21/08 ELA NAO TINHA FERRAMENTA NENHUMA — chamava `llm.chat()` direto,
 * sem tool-calling. Respondia com o que estivesse no contexto da aba e nada
 * mais.
 *
 * A vendedora perguntava "minha agenda hoje?" pelo WhatsApp e recebia; na tela,
 * a mesma pergunta nao tinha resposta. Nao foi decisao de produto — as
 * ferramentas nasceram para quem esta na rua, e ninguem voltou para o painel.
 *
 * Agora ela recebe AS MESMAS ferramentas do canal de WhatsApp, vindas do mesmo
 * `FerramentasVendedoraService`.
 * ==========================================================================
 *
 * O ESCOPO VEM DO LOGIN, e nao do telefone. `resolverVendedoraIdPorAdminUser`
 * traduz o usuario autenticado na vendedora dele — o mesmo caminho que o escopo
 * de vendas ja usa. Quem NAO e vendedora nao recebe ferramenta: nao ha "agenda
 * dela" para consultar, e oferecer a ferramenta so convidaria o modelo a chamar
 * e receber vazio.
 *
 * RELATO FICA DE FORA no painel: ele existe para a vendedora responder a uma
 * cobranca que chegou no WhatsApp. Sem a frase original em maos, o extrator nao
 * tem o que extrair — ver `ContextoVendedora.textoOriginal`.
 */
@Injectable()
export class ChatElenaUseCase {
  constructor(
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    private readonly config: ConfigService,
    @Inject(AGENTE_PROMPTS_REPOSITORY)
    private readonly prompts: IAgentePromptsRepository,
    private readonly ferramentas: FerramentasVendedoraService,
    @Inject(VENDA_REPOSITORY)
    private readonly vendas: IVendaRepository,
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
  ) {}

  async execute(
    mensagens: MensagemAgente[],
    contexto?: ContextoAgente,
    solicitante?: SolicitanteChat,
  ): Promise<ChatComFerramentasResultado> {
    const model =
      this.config.get<string>('ANTHROPIC_MODEL_ELENA') ?? 'claude-sonnet-4-6';

    const base = (await this.prompts.buscar('elena')) ?? ELENA_SYSTEM;

    // SEM ISTO A TOOL NAO CONSEGUE AGENDAR. O modelo nao sabe que dia e hoje;
    // para converter "amanha as 15h" em data ele precisa da referencia.
    const comData = `${base}

Agora sao ${agoraLocal()} (fuso da loja). Use isto para interpretar "hoje", "amanhã" e horários relativos.`;

    const system = contexto
      ? `${comData}\n\nContexto atual:\n${JSON.stringify(contexto.dados ?? {})}`
      : comData;

    return this.llm.chatComFerramentas({
      model,
      system,
      maxTokens: 2048,
      mensagens: sanitizarMensagens(mensagens),
      ...(await this.ferramentasDaVendedora(solicitante)),
    });
  }

  /**
   * As ferramentas dela, quando quem esta logado E uma vendedora.
   *
   * Devolve `{}` para todo o resto — inclusive para a gestao. A gestao tem o
   * proprio conjunto, na Anastasia; misturar os dois aqui daria a mesma
   * ferramenta com dois significados de "dela".
   */
  private async ferramentasDaVendedora(solicitante?: SolicitanteChat) {
    if (!solicitante?.userId) return {};

    const vendedoraId = await this.vendas.resolverVendedoraIdPorAdminUser(
      solicitante.userId,
    );
    if (!vendedoraId) return {};

    // O codigo do ERP e o que define a CARTEIRA. Sem ele as ferramentas de
    // cliente devolvem vazio, e e assim que deve ser.
    const vendedora = await this.vendedoras.buscarPorId(vendedoraId);

    return this.ferramentas.montar({
      vendedoraId,
      codigoErp: vendedora?.codigoErp ?? null,
      // Sem `textoOriginal`: relato nao existe no painel.
    });
  }
}

function agoraLocal(): string {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'full',
    timeStyle: 'short',
  });
}
