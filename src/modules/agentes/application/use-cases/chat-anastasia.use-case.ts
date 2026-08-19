import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { limparEHigienizar } from '../../../../shared/http/sanitize/sanitize-text.transform';
import { CriarDemandaUseCase } from '../../../demandas/application/use-cases/criar-demanda.use-case';
import type { MensagemAgente } from '../../domain/entities/conversa.entity';
import {
  AGENTE_PROMPTS_REPOSITORY,
  LLM_CLIENT,
} from '../../domain/ports/injection-tokens';
import type {
  AvisarVendedoraHandler,
  ChatComGraficoResultado,
  ILlmClient,
  RegistrarDemandaHandler,
} from '../../domain/ports/llm-client.port';
import { AvisarVendedoraUseCase } from './avisar-vendedora.use-case';
import type { IAgentePromptsRepository } from '../../domain/ports/repositories/agente-prompts-repository.port';
import { ANASTASIA_SYSTEM } from '../personas';

export interface ContextoAgente {
  aba?: string;
  dados?: unknown;
}

// Identidade da usuaria (staff) que conversa no painel. Vem do JWT do
// controller e serve para carimbar o solicitante da demanda (RF-24).
export interface SolicitanteChat {
  userId: string;
  // Rotulo de fallback (email do token) quando o staff nao tem nome cadastrado.
  nomeFallback: string;
}

@Injectable()
export class ChatAnastasiaUseCase {
  constructor(
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    private readonly config: ConfigService,
    @Inject(AGENTE_PROMPTS_REPOSITORY)
    private readonly prompts: IAgentePromptsRepository,
    private readonly criarDemanda: CriarDemandaUseCase,
    private readonly avisarVendedora: AvisarVendedoraUseCase,
  ) {}

  async execute(
    mensagens: MensagemAgente[],
    contexto?: ContextoAgente,
    solicitante?: SolicitanteChat,
  ): Promise<ChatComGraficoResultado> {
    const model =
      this.config.get<string>('ANTHROPIC_MODEL_ANASTASIA') ?? 'claude-opus-4-8';

    const base = (await this.prompts.buscar('anastasia')) ?? ANASTASIA_SYSTEM;
    const system = contexto
      ? `${base}\n\nContexto da aba aberta: ${contexto.aba ?? 'não informada'}.\nDados disponíveis no momento: ${JSON.stringify(contexto.dados ?? {})}`
      : base;

    return this.llm.chatComGrafico({
      model,
      system,
      maxTokens: 2048,
      mensagens: sanitizarMensagens(mensagens),
      // So habilita a tool registrar_demanda quando conhecemos quem conversa.
      registrarDemanda: solicitante
        ? this.montarHandlerDemanda(solicitante)
        : undefined,
      // Mesma regra do registrar_demanda: so com usuaria identificada. Isto
      // dispara WhatsApp para fora, entao nao roda em chamada anonima.
      avisarVendedora: solicitante ? this.montarHandlerAviso() : undefined,
    });
  }

  // Handler da tool registrar_demanda: reusa o use case de criar demanda,
  // fixando canal ASSISTENTE e a usuaria autenticada como solicitante.
  private montarHandlerDemanda(
    solicitante: SolicitanteChat,
  ): RegistrarDemandaHandler {
    return async (input) => {
      const criada = await this.criarDemanda.execute({
        tipo: input.tipo,
        // A descricao vem do modelo (influenciavel pela conversa) e nao passa
        // pelo DTO — higieniza aqui como os DTOs fazem via @SanitizeText().
        descricao: limparEHigienizar(input.descricao),
        canal: 'ASSISTENTE',
        solicitanteUserId: solicitante.userId,
        solicitanteNomeFallback: solicitante.nomeFallback,
      });
      return { id: criada.id as string };
    };
  }

  private montarHandlerAviso(): AvisarVendedoraHandler {
    return montarHandlerAvisoDe(this.avisarVendedora);
  }
}

// Handler da tool avisar_vendedora. Traduz o resultado fechado do use case
// em UMA frase para a Anastasia repassar. Nenhuma variante devolve telefone,
// e a vendedora nunca vem da conversa — sai da carteira do cliente.
function montarHandlerAvisoDe(
  uc: AvisarVendedoraUseCase,
): AvisarVendedoraHandler {
  return async (input) => {
    const r = await uc.execute({
      // O nome vem do modelo (influenciavel pela conversa) e nao passa por
      // DTO — higieniza aqui, como os DTOs fazem via @SanitizeText().
      cliente: limparEHigienizar(input.cliente),
      assunto: input.assunto ? limparEHigienizar(input.assunto) : undefined,
      quando: input.quando ? limparEHigienizar(input.quando) : undefined,
    });

    switch (r.status) {
      case 'ENVIADO':
        return {
          status: r.status,
          mensagem: `Aviso enviado no WhatsApp de ${r.vendedoraNome}, sobre o cliente ${r.clienteNome}. Confirme isso à usuária em uma frase.`,
        };
      case 'CLIENTE_NAO_ENCONTRADO':
        return {
          status: r.status,
          mensagem: `Nenhum cliente ativo encontrado com "${r.termo}". Peça à usuária o nome completo ou o código do cliente.`,
        };
      case 'CLIENTE_AMBIGUO':
        return {
          status: r.status,
          mensagem: `Há ${r.quantidade} clientes ativos cujo nome contém "${r.termo}". Peça à usuária o nome completo ou o código para desambiguar. NÃO escolha por conta própria.`,
        };
      case 'SEM_VENDEDORA':
        return {
          status: r.status,
          mensagem: `O cliente ${r.clienteNome} não tem vendedora associada na carteira, então não há para quem avisar. Diga isso à usuária.`,
        };
      case 'VENDEDORA_NAO_ENCONTRADA':
        return {
          status: r.status,
          mensagem: `A carteira do cliente ${r.clienteNome} aponta para o código de vendedora ${r.codigo}, que não existe no cadastro. Avise a usuária de que o vínculo está inconsistente.`,
        };
      case 'VENDEDORA_SEM_WHATSAPP':
        return {
          status: r.status,
          mensagem: `${r.vendedoraNome} é a vendedora do cliente, mas não tem WhatsApp interno cadastrado — sem ele não há como avisar. Diga isso à usuária.`,
        };
      case 'NUMERO_SEM_WHATSAPP':
        return {
          status: r.status,
          mensagem: `O número interno cadastrado para ${r.vendedoraNome} não tem conta de WhatsApp. Avise a usuária de que o cadastro precisa ser corrigido.`,
        };
      case 'FALHA_ENVIO':
        return {
          status: r.status,
          mensagem: `A vendedora é ${r.vendedoraNome}, mas o envio pelo WhatsApp falhou — a conexão pode estar fora. Peça à usuária para tentar de novo em instantes.`,
        };
    }
  };
}

// Higieniza o conteudo das mensagens do usuario antes de enviar ao LLM
// (defesa anti-prompt-injection — remove invisiveis/control chars e XSS).
export function sanitizarMensagens(mensagens: MensagemAgente[]): MensagemAgente[] {
  return mensagens.map((m) =>
    m.role === 'user' ? { ...m, content: limparEHigienizar(m.content) } : m,
  );
}
