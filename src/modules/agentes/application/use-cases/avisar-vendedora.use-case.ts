import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { RegistrarEventoUseCase } from '../../../agente-eventos/application/use-cases/registrar-evento.use-case';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';

export interface AvisarVendedoraInput {
  /** Nome (ou parte) do cliente, como o ADM escreveu na conversa. */
  cliente: string;
  /** O que ele procura, em uma frase. Opcional. */
  assunto?: string;
  /** Horario combinado, como o ADM falou ("hoje no fim da tarde"). Opcional. */
  quando?: string;
}

/**
 * Resultado fechado, para a tool virar UMA frase da Anastasia em vez de erro
 * na tela. Nenhuma variante carrega telefone.
 */
export type ResultadoAviso =
  | { status: 'ENVIADO'; clienteNome: string; vendedoraNome: string }
  | { status: 'CLIENTE_NAO_ENCONTRADO'; termo: string }
  | { status: 'CLIENTE_AMBIGUO'; termo: string; quantidade: number }
  | { status: 'SEM_VENDEDORA'; clienteNome: string }
  | { status: 'VENDEDORA_NAO_ENCONTRADA'; clienteNome: string; codigo: string }
  | { status: 'VENDEDORA_SEM_WHATSAPP'; vendedoraNome: string }
  | { status: 'NUMERO_SEM_WHATSAPP'; vendedoraNome: string }
  | { status: 'FALHA_ENVIO'; vendedoraNome: string };

/**
 * Avisa a vendedora, pelo WhatsApp, que um cliente dela pediu atendimento.
 *
 * A VENDEDORA NAO E ESCOLHIDA NA CONVERSA. Ela sai de
 * `clientes.vendedora_codigo_erp` — a carteira, que vem do ERP. O modelo passa
 * so o nome do cliente; quem resolve o resto e o servidor. Nao existe caminho
 * de codigo para "avisa a Beatriz em vez da Maria", entao nenhuma injecao de
 * prompt alcanca outra vendedora.
 *
 * O texto e FIXO, sem LLM: e aviso, nao conversa. Mais barato, previsivel, e
 * sem superficie de injecao no que sai daqui. O `assunto` e o `quando` sao os
 * unicos trechos vindos da conversa, e vao entre aspas no template.
 */
@Injectable()
export class AvisarVendedoraUseCase {
  private readonly logger = new Logger(AvisarVendedoraUseCase.name);

  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
    private readonly registrarEvento: RegistrarEventoUseCase,
  ) {}

  async execute(input: AvisarVendedoraInput): Promise<ResultadoAviso> {
    const termo = input.cliente.trim();
    if (termo.length < 3) {
      return { status: 'CLIENTE_NAO_ENCONTRADO', termo };
    }

    // Teto de 5: so precisamos saber se e um, nenhum, ou "varios".
    const achados = await this.clientes.buscarPorNomeParcial(termo, 5);
    if (achados.length === 0) {
      return { status: 'CLIENTE_NAO_ENCONTRADO', termo };
    }
    if (achados.length > 1) {
      return { status: 'CLIENTE_AMBIGUO', termo, quantidade: achados.length };
    }

    const cliente = achados[0];
    const codigo = cliente.vendedoraCodigoErp;
    if (!codigo) {
      return { status: 'SEM_VENDEDORA', clienteNome: cliente.nome };
    }

    const vendedora = await this.vendedoras.buscarPorCodigoErp(codigo);
    if (!vendedora) {
      return {
        status: 'VENDEDORA_NAO_ENCONTRADA',
        clienteNome: cliente.nome,
        codigo,
      };
    }
    if (!vendedora.whatsappInterno) {
      return { status: 'VENDEDORA_SEM_WHATSAPP', vendedoraNome: vendedora.nome };
    }

    const texto = montarAviso({
      vendedora: vendedora.nome,
      cliente: cliente.nome,
      assunto: input.assunto,
      quando: input.quando,
    });

    // Pergunta ao WAHA qual e o chatId real do numero. Ver o comentario da
    // porta: concatenar o telefone entrega a mensagem no vazio quando a conta
    // e anterior ao nono digito.
    let chatId: string | null;
    try {
      chatId = await this.whatsapp.resolverChatId(vendedora.whatsappInterno);
    } catch (err) {
      this.logger.error(
        `Falha ao resolver o chatId da vendedora ${vendedora.id}: ${err instanceof Error ? err.message : err}`,
      );
      return { status: 'FALHA_ENVIO', vendedoraNome: vendedora.nome };
    }

    if (!chatId) {
      return { status: 'NUMERO_SEM_WHATSAPP', vendedoraNome: vendedora.nome };
    }

    try {
      await this.whatsapp.enviarTexto(chatId, texto);
    } catch (err) {
      // O erro fica no log; para a Anastasia vira uma frase.
      this.logger.error(
        `Falha ao avisar a vendedora ${vendedora.id}: ${err instanceof Error ? err.message : err}`,
      );
      return { status: 'FALHA_ENVIO', vendedoraNome: vendedora.nome };
    }

    // Registro do evento nao pode derrubar um aviso ja entregue.
    try {
      await this.registrarEvento.execute({
        agente: 'anastasia',
        tipoEvento: 'handoff_realizado',
        clienteId: cliente.id,
        vendedoraId: vendedora.id,
        payload: { canal: 'whatsapp', origem: 'painel' },
      });
    } catch (err) {
      this.logger.warn(
        `Aviso enviado, mas o evento nao foi registrado: ${err instanceof Error ? err.message : err}`,
      );
    }

    return {
      status: 'ENVIADO',
      clienteNome: cliente.nome,
      vendedoraNome: vendedora.nome,
    };
  }
}

/** Texto fixo do aviso. As partes vindas da conversa sao opcionais. */
function montarAviso(dados: {
  vendedora: string;
  cliente: string;
  assunto?: string;
  quando?: string;
}): string {
  const primeiroNome = dados.vendedora.trim().split(/\s+/)[0];
  const linhas = [`${primeiroNome}, chegou um cliente para você: ${dados.cliente}.`];
  if (dados.assunto?.trim()) linhas.push(`Interesse: ${dados.assunto.trim()}.`);
  if (dados.quando?.trim()) linhas.push(`Pediu contato ${dados.quando.trim()}.`);
  linhas.push('Quando falar com ele, me conta como foi.');
  return linhas.join(' ');
}
