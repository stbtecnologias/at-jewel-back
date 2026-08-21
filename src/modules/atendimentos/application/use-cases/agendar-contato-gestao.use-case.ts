import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import { ATENDIMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAtendimentoRepository } from '../../domain/ports/repositories/atendimento-repository.port';

/** Minutos antes do combinado em que sai o lembrete. */
const MINUTOS_LEMBRETE = 15;
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

export type ResultadoAgendamentoGestao =
  | {
      status: 'AGENDADO';
      cliente: string;
      vendedora: string;
      quando: Date;
      transferido: boolean;
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
    };

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
  ) {}

  async execute(entrada: {
    vendedoraId: string;
    vendedoraNome: string;
    vendedoraCodigoErp: string | null;
    nomeCliente: string;
    quandoIso: string;
    /** Ausente = ainda nao foi decidido; a bifurcacao para o fluxo. */
    modo?: ModoAgendamento;
  }): Promise<ResultadoAgendamentoGestao> {
    const quando = interpretarHorario(entrada.quandoIso);
    if (!quando) return { status: 'HORARIO_INVALIDO' };

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

    const lembrete = new Date(quando.getTime() - MINUTOS_LEMBRETE * 60_000);
    if (lembrete.getTime() > Date.now()) {
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
        `Contato agendado pela administração para ${quando.toLocaleString('pt-BR')}` +
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
    };
  }
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
