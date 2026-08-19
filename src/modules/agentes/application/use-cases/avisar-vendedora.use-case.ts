import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { RegistrarEventoUseCase } from '../../../agente-eventos/application/use-cases/registrar-evento.use-case';
import { ATENDIMENTO_REPOSITORY } from '../../../atendimentos/domain/ports/injection-tokens';
import type { OcasiaoAtendimento } from '../../../atendimentos/domain/entities/enums';
import { OCASIOES_ATENDIMENTO } from '../../../atendimentos/domain/entities/enums';
import type { IAtendimentoRepository } from '../../../atendimentos/domain/ports/repositories/atendimento-repository.port';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';

export interface AvisarVendedoraInput {
  /** Nome (ou parte) do cliente, como o ADM escreveu na conversa. */
  cliente: string;
  /** O que ele procura, em uma frase. Opcional. */
  assunto?: string;
  /** Horario combinado, como o ADM falou ("hoje no fim da tarde"). Opcional. */
  quando?: string;
  /**
   * O mesmo horario em ISO 8601, resolvido pelo modelo a partir da data de
   * hoje (que vai no system prompt). E o que permite AGENDAR — o texto livre
   * sozinho nao vira relogio. Validado aqui antes de virar agendamento.
   */
  quandoIso?: string;
  /** Para qual acontecimento, se a usuaria disser. */
  ocasiao?: string;
}

/**
 * Resultado fechado, para a tool virar UMA frase da Anastasia em vez de erro
 * na tela. Nenhuma variante carrega telefone.
 */
export type ResultadoAviso =
  | {
      status: 'ENVIADO';
      clienteNome: string;
      vendedoraNome: string;
      /** Quando a cobranca foi agendada. Nulo quando nao houve horario. */
      cobrancaEm: Date | null;
    }
  /**
   * O aviso ja tinha saido ha pouco: os dados novos foram anotados no mesmo
   * atendimento e NENHUMA mensagem foi enviada de novo.
   */
  | {
      status: 'COMPLEMENTADO';
      clienteNome: string;
      vendedoraNome: string;
      cobrancaEm: Date | null;
    }
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
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly atendimentos: IAtendimentoRepository,
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
    const clienteId = cliente.id;
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
    const vendedoraId = vendedora.id;

    // COMPLEMENTO, NAO SEGUNDO AVISO. Quem escreve no painel manda o pedido
    // em linhas: "avisa a vendedora da Carla" e, logo depois, "e a ocasiao e
    // noivado, as 15h30". A segunda linha e detalhe da primeira — reenviar o
    // WhatsApp faria a vendedora receber a mesma coisa duas vezes, que foi o
    // que aconteceu no teste de 19/08.
    const complemento = await this.avisoRecenteDe(clienteId, vendedoraId);
    if (complemento) {
      const cobrancaEm = await this.registrarNoAtendimento({
        clienteId,
        vendedoraId,
        ocasiao: normalizarOcasiao(input.ocasiao),
        combinado: interpretarHorario(input.quandoIso),
        jaAvisado: true,
      });
      return {
        status: 'COMPLEMENTADO',
        clienteNome: cliente.nome,
        vendedoraNome: vendedora.nome,
        cobrancaEm,
      };
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

    // Daqui para baixo o WhatsApp JA FOI. Nada pode lancar excecao e fazer a
    // Anastasia dizer que falhou algo que a vendedora ja leu.
    let cobrancaEm: Date | null = null;
    try {
      cobrancaEm = await this.registrarNoAtendimento({
        clienteId,
        vendedoraId,
        ocasiao: normalizarOcasiao(input.ocasiao),
        combinado: interpretarHorario(input.quandoIso),
        jaAvisado: false,
      });
    } catch (err) {
      this.logger.error(
        `Aviso enviado, mas o atendimento nao foi registrado: ${err instanceof Error ? err.message : err}`,
      );
    }

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
      cobrancaEm,
    };
  }

  /**
   * Abre o episodio (ou reaproveita o que ja esta em curso) e escreve a linha
   * do tempo. Devolve quando a cobranca ficou agendada, ou null.
   *
   * REAPROVEITA de proposito: o banco so aceita UM atendimento aberto por
   * cliente. Pedir atendimento de novo enquanto o anterior corre e continuacao
   * da mesma conversa, nao episodio novo — vira mais uma interacao.
   */
  private async registrarNoAtendimento(dados: {
    // `string | undefined` porque a entidade de dominio admite id ausente (nao
    // persistida). Vindo do repositorio sempre tem — a guarda abaixo e para o
    // compilador e para o caso impossivel.
    clienteId: string | undefined;
    vendedoraId: string | undefined;
    ocasiao: OcasiaoAtendimento | null;
    combinado: Date | null;
    /** true quando isto e complemento de um aviso ja enviado. */
    jaAvisado: boolean;
  }): Promise<Date | null> {
    const { clienteId, vendedoraId } = dados;
    if (!clienteId || !vendedoraId) {
      this.logger.warn(`Aviso enviado sem id de cliente/vendedora — atendimento nao registrado.`);
      return null;
    }

    const emCurso = await this.atendimentos.buscarAbertoPorCliente(clienteId);
    const atendimento =
      emCurso ??
      (await this.atendimentos.abrir({
        clienteId,
        vendedoraId,
        ocasiao: dados.ocasiao,
      }));

    // Reaproveitando um episodio que abriu sem ocasiao: se agora ela veio,
    // preenche. Nao sobrescreve ocasiao ja definida — ver o comentario da porta.
    if (emCurso && dados.ocasiao) {
      await this.atendimentos.completarOcasiaoSeVazia(atendimento.id, dados.ocasiao);
    }

    const agora = new Date();
    if (!dados.jaAvisado) {
      await this.atendimentos.criarInteracao({
        atendimentoId: atendimento.id,
        tipo: 'ENCAMINHADO',
        ocorridoEm: agora,
        estado: 'CONCLUIDA',
      });
    }

    if (!dados.combinado) return null;

    // Sem regra de horario comercial: o combinado vale como foi dito, inclusive
    // domingo as 21h (decisao do Lucas, 19/08/2026).
    const lembrete = new Date(dados.combinado.getTime() - MINUTOS_LEMBRETE * 60_000);
    const cobranca = new Date(dados.combinado.getTime() + MINUTOS_COBRANCA * 60_000);

    // REAGENDAMENTO so quando JA HAVIA horario e ele MUDOU. Complemento que
    // traz o primeiro horario e o agendamento inicial, nao remarcacao — a
    // linha do tempo mentiria dizendo que remarcou algo que nunca teve hora.
    const cobrancaAtual = await this.atendimentos.ultimaInteracao(
      atendimento.id,
      'COBRANCA',
    );
    const anterior =
      cobrancaAtual?.estado === 'PENDENTE' ? cobrancaAtual.notificarEm : null;
    if (anterior && anterior.getTime() !== cobranca.getTime()) {
      await this.atendimentos.criarInteracao({
        atendimentoId: atendimento.id,
        tipo: 'REAGENDAMENTO',
        ocorridoEm: agora,
        estado: 'CONCLUIDA',
      });
    }

    // `reagendar` MOVE a pendencia existente em vez de criar outra: horario
    // corrigido no complemento, ou cliente que remarca, nao pode virar dois
    // lembretes para o mesmo atendimento.
    if (lembrete.getTime() > agora.getTime()) {
      await this.atendimentos.reagendar(
        atendimento.id,
        'LEMBRETE',
        lembrete,
        dados.combinado,
      );
    }
    await this.atendimentos.reagendar(
      atendimento.id,
      'COBRANCA',
      cobranca,
      dados.combinado,
    );

    return cobranca;
  }

  /**
   * Houve aviso para este cliente ha pouco? Olha o ENCAMINHADO mais recente do
   * atendimento em curso. A janela existe porque quem escreve no painel manda
   * o pedido em partes — e nao ha por que a vendedora receber duas mensagens.
   */
  private async avisoRecenteDe(
    clienteId: string | undefined,
    vendedoraId: string | undefined,
  ): Promise<boolean> {
    if (!clienteId || !vendedoraId) return false;
    const emCurso = await this.atendimentos.buscarAbertoPorCliente(clienteId);
    if (!emCurso) return false;

    const ultimo = await this.atendimentos.ultimaInteracao(emCurso.id, 'ENCAMINHADO');
    const quando = ultimo?.ocorridoEm ?? ultimo?.criadoEm;
    if (!quando) return false;

    return Date.now() - quando.getTime() < MINUTOS_JANELA_COMPLEMENTO * 60_000;
  }
}

/**
 * Janela em que um novo pedido para o MESMO cliente e tratado como complemento
 * do anterior, sem reenviar o WhatsApp. Passado disso, e pedido novo de
 * verdade — o cliente ligou outra vez — e a vendedora deve ser avisada.
 */
const MINUTOS_JANELA_COMPLEMENTO = 10;

/** Quantos minutos ANTES do combinado sai o lembrete para a vendedora. */
const MINUTOS_LEMBRETE = 15;
/** Quantos minutos DEPOIS do combinado a Anastasia pergunta como foi. */
const MINUTOS_COBRANCA = 60;

/** Teto de quanto no futuro um agendamento pode estar: 180 dias. */
const DIAS_MAXIMOS = 180;

/**
 * Valida o ISO vindo do modelo. Recusa o que nao e data, o que ja passou e o
 * que esta absurdamente longe — o modelo erra o ano com facilidade, e um
 * agendamento para 2027 ficaria pendente para sempre.
 */
function interpretarHorario(iso?: string): Date | null {
  if (!iso) return null;
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return null;

  const agora = Date.now();
  // Tolera 5 min de atraso: o ADM pode dizer "as 17h" as 17h02.
  if (quando.getTime() < agora - 5 * 60_000) return null;
  if (quando.getTime() > agora + DIAS_MAXIMOS * 24 * 60 * 60_000) return null;
  return quando;
}

/** So aceita ocasiao da lista fechada; qualquer outra coisa vira null. */
function normalizarOcasiao(valor?: string): OcasiaoAtendimento | null {
  if (!valor) return null;
  const alvo = valor.trim().toUpperCase();
  return (OCASIOES_ATENDIMENTO as readonly string[]).includes(alvo)
    ? (alvo as OcasiaoAtendimento)
    : null;
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
