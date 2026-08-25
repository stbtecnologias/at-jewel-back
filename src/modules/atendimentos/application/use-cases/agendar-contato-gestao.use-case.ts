import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import { ATENDIMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAtendimentoRepository } from '../../domain/ports/repositories/atendimento-repository.port';

/** Minutos antes do combinado em que sai o lembrete. */
export const MINUTOS_LEMBRETE = 15;
/** Minutos depois em que a cobranca volta a perguntar como foi. */
const MINUTOS_COBRANCA = 60;
/** Teto de quanto no futuro um agendamento pode estar. */
const DIAS_MAXIMOS = 180;
/** Quantos homonimos a busca traz antes de desistir e perguntar. */
const MAXIMO_HOMONIMOS = 5;

/** O que fazer quando o cliente e de outra carteira. */
export type ModoAgendamento =
  /** Marca o contato e NAO mexe na carteira — atendimento pontual. */
  | 'OCASIONAL'
  /** Marca o contato E move o cliente para a carteira da nova vendedora. */
  | 'TRANSFERIR';

/**
 * O que aconteceu com o AVISO da vendedora — separado do agendamento em si,
 * porque as duas coisas podem terminar diferente.
 *
 * Ate 25/08 nao existia aviso nenhum: o ADM marcava para 30/09 e a vendedora
 * descobria as 14h45 do dia 30, pelo lembrete. Um mes sem saber de um
 * compromisso que ja estava na agenda dela.
 */
export type AvisoDoAgendamento =
  /** A vendedora acabou de ser avisada do contato. */
  | 'ENVIADO'
  /** Ela ja sabia de outro horario, e foi avisada da mudanca. */
  | 'REMARCADO'
  /** Mesmo horario que ja estava combinado — nada foi reenviado. */
  | 'JA_SABIA'
  /** Agendado, mas o WhatsApp nao saiu. So o lembrete a alcanca. */
  | 'FALHOU';

export type ResultadoAgendamentoGestao =
  | {
      status: 'AGENDADO';
      cliente: string;
      vendedora: string;
      quando: Date;
      transferido: boolean;
      aviso: AvisoDoAgendamento;
      /** false quando o combinado esta perto demais para valer um lembrete. */
      temLembrete: boolean;
    }
  /**
   * O cliente e de OUTRA vendedora e ninguem disse o que fazer. Nao e erro:
   * e a pergunta que falta ser respondida antes de escrever qualquer coisa.
   */
  | {
      status: 'CARTEIRA_DE_OUTRA';
      cliente: string;
      clienteId: string;
      donaAtual: string;
      vendedoraDestino: string;
      vendedoraDestinoId: string;
      quando: Date;
    }
  | { status: 'CLIENTE_NAO_ENCONTRADO' }
  /**
   * Homonimos. As linhas trazem CODIGO e CARTEIRA, nao so o nome — com cinco
   * "Daniela Pereira" na base, repetir o nome cinco vezes nao ajuda ninguem a
   * escolher. O codigo e o que a pessoa pode devolver para desempatar.
   */
  | { status: 'CLIENTE_AMBIGUO'; opcoes: string[] }
  | { status: 'HORARIO_INVALIDO' }
  /**
   * Episodio em curso com outra pessoa. Carrega `transferido` porque a
   * carteira PODE ter mudado mesmo assim — sao coisas independentes, e omitir
   * isso faria a resposta contar meia verdade.
   */
  | {
      status: 'ATENDIMENTO_DE_OUTRA_PESSOA';
      cliente: string;
      vendedora: string;
      transferido: boolean;
    }
  /**
   * Sem numero interno nao ha como avisar — e o agendamento existe PARA
   * avisar. Recusa antes de gravar qualquer coisa: marcar um contato que a
   * vendedora nunca vai receber e pior do que nao marcar, porque o painel
   * mostraria um compromisso que ninguem viu.
   */
  | { status: 'VENDEDORA_SEM_WHATSAPP'; vendedora: string };

/**
 * O ADM marca um contato na agenda de QUALQUER vendedora.
 *
 * ==========================================================================
 * A DIFERENCA PARA O `AgendarContatoVendedoraUseCase` NAO E SO O ESCOPO.
 *
 * La o cliente e procurado DENTRO da carteira dela, e cliente de fora
 * simplesmente nao existe para a consulta — porque a recusa vazaria que ele
 * existe e que tem dona.
 *
 * Aqui o ADM PODE saber de quem e o cliente. Entao a busca e global, e
 * encontrar o cliente na carteira de outra pessoa nao e erro: e uma
 * BIFURCACAO. Marcar sem avisar seria pior dos dois jeitos — ou a dona atual
 * perde um contato sem saber, ou o cliente muda de carteira sem ninguem ter
 * pedido.
 *
 * Por isso este use case PARA e devolve `CARTEIRA_DE_OUTRA` quando ninguem
 * escolheu ainda. Quem escolhe e a pessoa, na conversa; o `modo` so chega aqui
 * depois disso.
 * ==========================================================================
 *
 * TRANSFERIR muda `clientes.vendedora_codigo_erp` — e permanente e vale para
 * tudo (carteira, relatorio, roteamento da Anastasia), nao so para este
 * contato. OCASIONAL nao encosta na carteira.
 */
@Injectable()
export class AgendarContatoGestaoUseCase {
  private readonly logger = new Logger(AgendarContatoGestaoUseCase.name);

  constructor(
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly atendimentos: IAtendimentoRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
  ) {}

  async execute(entrada: {
    vendedoraId: string;
    vendedoraNome: string;
    vendedoraCodigoErp: string | null;
    nomeCliente: string;
    quandoIso: string;
    /** Ausente = ainda nao foi decidido; a bifurcacao para o fluxo. */
    modo?: ModoAgendamento;
    /**
     * Quem esta marcando, para a vendedora saber de quem veio. Pode faltar
     * (chamada sem usuaria identificada) ou vir como e-mail — ver `nomeDeGente`.
     */
    solicitanteNome?: string | null;
  }): Promise<ResultadoAgendamentoGestao> {
    const quando = interpretarHorario(entrada.quandoIso);
    if (!quando) return { status: 'HORARIO_INVALIDO' };

    // A TRAVA VEM ANTES DE TUDO, e a posicao importa: mais abaixo o metodo ja
    // teria transferido a carteira do cliente. Recusar depois disso deixaria a
    // transferencia feita e o agendamento nao — o pior dos dois mundos.
    const destino = await this.vendedoras.buscarPorId(entrada.vendedoraId);
    if (!destino?.whatsappInterno) {
      return { status: 'VENDEDORA_SEM_WHATSAPP', vendedora: entrada.vendedoraNome };
    }

    const termo = entrada.nomeCliente.trim();

    // CODIGO ANTES DE NOME: e assim que a pessoa desempata homonimos. Quando a
    // ferramenta lista "Daniela Pereira (SEED-C0012)", a resposta esperada e o
    // codigo — buscar por nome de novo devolveria a mesma ambiguidade.
    const porCodigo = await this.clientes.buscarPorCodigoErp(termo);

    // Busca GLOBAL por nome, ao contrario do canal da vendedora.
    const achados = porCodigo
      ? [porCodigo]
      : await this.clientes.buscarPorNomeParcial(termo, MAXIMO_HOMONIMOS + 1);

    if (achados.length === 0) return { status: 'CLIENTE_NAO_ENCONTRADO' };
    if (achados.length > 1) {
      const opcoes: string[] = [];
      for (const c of achados.slice(0, MAXIMO_HOMONIMOS)) {
        const dona = c.vendedoraCodigoErp
          ? await this.vendedoras.buscarPorCodigoErp(c.vendedoraCodigoErp)
          : null;
        opcoes.push(
          `${c.nome}${c.codigoErp ? ` (código ${c.codigoErp})` : ''} — ` +
            (dona ? `carteira de ${dona.nome}` : 'sem vendedora vinculada'),
        );
      }
      return { status: 'CLIENTE_AMBIGUO', opcoes };
    }

    const cliente = achados[0];
    if (!cliente.id) return { status: 'CLIENTE_NAO_ENCONTRADO' };

    // A BIFURCACAO. Cliente sem carteira nenhuma nao para o fluxo: nao ha dona
    // para avisar, e vincular na hora e o comportamento util.
    const donoAtual = cliente.vendedoraCodigoErp;
    const deOutra = Boolean(donoAtual) && donoAtual !== entrada.vendedoraCodigoErp;

    if (deOutra && !entrada.modo) {
      const dona = await this.vendedoras.buscarPorCodigoErp(donoAtual!);
      return {
        status: 'CARTEIRA_DE_OUTRA',
        cliente: cliente.nome,
        clienteId: cliente.id,
        donaAtual: dona?.nome ?? `vendedora ${donoAtual}`,
        vendedoraDestino: entrada.vendedoraNome,
        vendedoraDestinoId: entrada.vendedoraId,
        quando,
      };
    }

    // A TRANSFERENCIA VEM ANTES DA TRAVA DO ATENDIMENTO, e a ordem foi
    // corrigida em 21/08 depois de um teste que passou errado.
    //
    // Estava ao contrario: a trava saia primeiro, e um cliente com episodio
    // aberto com a vendedora antiga fazia o metodo retornar SEM transferir —
    // mesmo com o ADM tendo dito "transfere". A carteira ficava como estava e
    // ninguem era avisado disso.
    //
    // As duas coisas sao independentes: CARTEIRA e de quem o cliente e daqui
    // para frente; ATENDIMENTO e um episodio em curso, que continua com quem
    // esta conduzindo. Mover a carteira nao apaga historico de ninguem.
    let transferido = false;
    if (deOutra && entrada.modo === 'TRANSFERIR') {
      if (!entrada.vendedoraCodigoErp) {
        // Destino sem codigo do ERP nao tem carteira para receber ninguem.
        return { status: 'CLIENTE_NAO_ENCONTRADO' };
      }
      await this.clientes.transferirCarteira(cliente.id, entrada.vendedoraCodigoErp);
      transferido = true;
      this.logger.log(
        `Cliente ${cliente.id} transferido para a carteira ${entrada.vendedoraCodigoErp}.`,
      );
    }

    const emCurso = await this.atendimentos.buscarAbertoPorCliente(cliente.id);
    if (emCurso && emCurso.vendedoraId !== entrada.vendedoraId) {
      // Episodio aberto com outra vendedora: nao mexemos nele, porque
      // reescrever apagaria o historico de quem esta conduzindo. Mas o
      // resultado diz se a carteira MUDOU — senao a resposta contaria meia
      // verdade, e foi exatamente isso que aconteceu no teste.
      const conduz = await this.vendedoras.buscarPorId(emCurso.vendedoraId);
      return {
        status: 'ATENDIMENTO_DE_OUTRA_PESSOA',
        cliente: cliente.nome,
        vendedora: conduz?.nome ?? 'outra vendedora',
        transferido,
      };
    }

    const atendimento =
      emCurso ??
      (await this.atendimentos.abrir({
        clienteId: cliente.id,
        vendedoraId: entrada.vendedoraId,
      }));

    // O QUE ELA JA SABE. A cobranca pendente guarda o horario combinado, entao
    // e ela quem diz se este agendamento e novidade ou remarcacao. Cobranca ja
    // respondida nao conta: aquele episodio terminou.
    const cobrancaAtual = await this.atendimentos.ultimaInteracao(
      atendimento.id,
      'COBRANCA',
    );
    const combinadoAnterior =
      cobrancaAtual?.status === 'PENDENTE' ? cobrancaAtual.combinadoEm : null;

    const aviso = await this.avisar({
      whatsappInterno: destino.whatsappInterno,
      vendedoraId: entrada.vendedoraId,
      vendedoraNome: entrada.vendedoraNome,
      clienteNome: cliente.nome,
      quando,
      combinadoAnterior,
      solicitante: nomeDeGente(entrada.solicitanteNome),
    });

    // LEMBRETE SUPRIMIDO QUANDO O AVISO ACABOU DE SAIR (decisao do Lucas,
    // 25/08/2026). Marcar para daqui a 20 minutos mandava o aviso agora e o
    // lembrete cinco minutos depois: duas mensagens quase juntas dizendo a
    // mesma coisa. Se o aviso NAO saiu, o lembrete e a unica chance de ela
    // saber — entao ele fica.
    const lembrete = new Date(quando.getTime() - MINUTOS_LEMBRETE * 60_000);
    // So `ENVIADO` e `REMARCADO` puseram uma mensagem no celular dela AGORA.
    // `JA_SABIA` nao mandou nada, e `FALHOU` tentou e nao foi.
    const acabouDeReceber = aviso === 'ENVIADO' || aviso === 'REMARCADO';
    const margem = acabouDeReceber ? MINUTOS_LEMBRETE * 60_000 : 0;
    const temLembrete = lembrete.getTime() > Date.now() + margem;
    if (temLembrete) {
      await this.atendimentos.reagendar(atendimento.id, 'LEMBRETE', lembrete, quando);
    }
    const cobranca = new Date(quando.getTime() + MINUTOS_COBRANCA * 60_000);
    await this.atendimentos.reagendar(atendimento.id, 'COBRANCA', cobranca, quando);

    // Quem marcou, e sob qual decisao, fica na linha do tempo. Daqui a um mes
    // ninguem lembra se a mudanca de carteira foi combinada ou acidente.
    await this.atendimentos.criarInteracao({
      atendimentoId: atendimento.id,
      tipo: 'NOTA',
      ocorridoEm: new Date(),
      status: 'CONCLUIDA',
      relato:
        (aviso === 'REMARCADO' ? 'Contato REMARCADO' : 'Contato agendado') +
        ` pela administração${entrada.solicitanteNome ? ` (${entrada.solicitanteNome})` : ''}` +
        ` para ${quando.toLocaleString('pt-BR')}` +
        (aviso === 'FALHOU' ? '. A vendedora NÃO foi avisada — o envio falhou' : '') +
        (transferido
          ? `. Cliente TRANSFERIDO para a carteira de ${entrada.vendedoraNome}.`
          : deOutra
            ? `. Atendimento ocasional — o cliente permanece na carteira de origem.`
            : '.'),
    });

    this.logger.log(`Contato agendado pela gestao no atendimento ${atendimento.id}.`);
    return {
      status: 'AGENDADO',
      cliente: cliente.nome,
      vendedora: entrada.vendedoraNome,
      quando,
      transferido,
      aviso,
      temLembrete,
    };
  }

  /**
   * Manda a vendedora saber do compromisso — na hora em que ele e criado, e nao
   * quinze minutos antes de acontecer.
   *
   * NAO LANCA. Falha de WhatsApp nao pode derrubar um agendamento que ja foi
   * decidido: a agenda continua valendo, o lembrete continua marcado, e quem
   * pediu recebe a frase dizendo que o aviso nao saiu.
   */
  private async avisar(dados: {
    whatsappInterno: string;
    vendedoraId: string;
    vendedoraNome: string;
    clienteNome: string;
    quando: Date;
    combinadoAnterior: Date | null;
    solicitante: string | null;
  }): Promise<AvisoDoAgendamento> {
    const { combinadoAnterior, quando } = dados;

    // Mesmo horario que ela ja conhece: reenviar seria ruido. Acontece quando o
    // ADM repete o pedido, ou corrige outra coisa do agendamento.
    if (combinadoAnterior && combinadoAnterior.getTime() === quando.getTime()) {
      return 'JA_SABIA';
    }
    const remarcacao = combinadoAnterior !== null;

    try {
      const chatId = await this.whatsapp.resolverChatId(dados.whatsappInterno);
      if (!chatId) {
        this.logger.warn(
          `Agendamento: o numero da vendedora ${dados.vendedoraId} nao tem WhatsApp.`,
        );
        return 'FALHOU';
      }
      await this.whatsapp.enviarTexto(
        chatId,
        montarAvisoDeAgendamento({
          vendedora: dados.vendedoraNome,
          cliente: dados.clienteNome,
          quando,
          solicitante: dados.solicitante,
          remarcacao,
        }),
      );
    } catch (err) {
      this.logger.error(
        `Falha ao avisar a vendedora ${dados.vendedoraId} do agendamento: ${err instanceof Error ? err.message : err}`,
      );
      return 'FALHOU';
    }

    return remarcacao ? 'REMARCADO' : 'ENVIADO';
  }
}

/**
 * Texto fixo, sem LLM: e aviso, nao conversa.
 *
 * A linha do lembrete some quando nao existe lembrete — prometer um toque que
 * nao vai acontecer e pior do que nao prometer nada.
 */
function montarAvisoDeAgendamento(dados: {
  vendedora: string;
  cliente: string;
  quando: Date;
  solicitante: string | null;
  remarcacao: boolean;
}): string {
  const primeiroNome = dados.vendedora.trim().split(/\s+/)[0];
  const quem = dados.solicitante ?? 'A administração';
  const quando = formatarQuando(dados.quando);

  const meio = dados.remarcacao
    ? `${quem} remarcou o contato com ${dados.cliente}: agora é ${quando}.`
    : `${quem} agendou o cliente ${dados.cliente} para ${quando}.`;

  const linhas = [`Olá, ${primeiroNome}! Tudo bem?`, meio];

  // Mesma conta do use case: com o combinado a menos de meia hora, o lembrete
  // nao e criado, entao a frase nao pode prometer um.
  if (dados.quando.getTime() > Date.now() + 2 * MINUTOS_LEMBRETE * 60_000) {
    linhas.push(`Eu te lembro ${MINUTOS_LEMBRETE} minutos antes.`);
  }
  return linhas.join('\n');
}

/**
 * O nome que a vendedora vai ler — ou nada.
 *
 * `SolicitanteChat.nomeFallback` vira o E-MAIL do token quando a pessoa nao tem
 * nome cadastrado. "l.barbosa@stbtecnologias.com.br agendou o cliente" seria
 * feio e ainda vazaria e-mail interno para fora da empresa. Sem nome de gente,
 * o aviso fala em nome da administracao.
 */
function nomeDeGente(valor?: string | null): string | null {
  const limpo = valor?.trim();
  if (!limpo || limpo.includes('@')) return null;
  return limpo;
}

/** Dia e hora em portugues de gente: "hoje às 15:00", "30/09 às 15:00". */
function formatarQuando(d: Date): string {
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const soDia = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = (soDia(d) - soDia(new Date())) / 86_400_000;

  if (dias === 0) return `hoje às ${hora}`;
  if (dias === 1) return `amanhã às ${hora}`;
  if (dias > 1 && dias < 7) {
    return `${d.toLocaleDateString('pt-BR', { weekday: 'long' })} às ${hora}`;
  }
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
}

/**
 * Aceita apenas horario FUTURO e dentro de seis meses. Data no passado quase
 * sempre e o modelo errando o ano; data muito distante, alucinacao.
 */
function interpretarHorario(iso: string): Date | null {
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return null;
  const agora = Date.now();
  if (quando.getTime() < agora) return null;
  if (quando.getTime() > agora + DIAS_MAXIMOS * 24 * 60 * 60_000) return null;
  return quando;
}
