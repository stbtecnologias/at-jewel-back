import { Inject, Injectable, Logger } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { BuscarClientePorWhatsappUseCase } from '../../../clientes/application/use-cases/buscar-cliente-por-whatsapp.use-case';
import {
  normalizarTelefone,
  variantesTelefone,
} from '../../../clientes/application/utils/normalizadores';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { LEAD_REPOSITORY } from '../../domain/ports/injection-tokens';
import { AvisarGestaoDeLeadUseCase } from './avisar-gestao-de-lead.use-case';
import type {
  ILeadRepository,
  Lead,
  OcasiaoLead,
  OrigemContato,
} from '../../domain/ports/repositories/lead-repository.port';

/**
 * Como o numero foi reconhecido. E o que permite a Anastasia abrir com "Ola,
 * Carla, tudo bem?" em vez de perguntar o nome de novo.
 */
export type ReconhecimentoLead =
  /** Ja existe conversa em andamento — nao e atendimento novo. */
  | 'CONVERSA_EM_ANDAMENTO'
  /** Ja passou por aqui antes; nome e apelido reaproveitados. */
  | 'LEAD_ANTERIOR'
  /** Nunca fez triagem, mas e cliente cadastrado no ERP. */
  | 'CLIENTE_ERP'
  /** Ninguem conhece esse numero. */
  | 'NOVO';

export interface RegistrarLeadInput {
  whatsapp: string;
  nome?: string | null;
  apelido?: string | null;
  origemContato?: OrigemContato | null;
  ocasiao?: OcasiaoLead | null;
  produtosDesejados?: string | null;
  resumoTriagem?: string | null;
  vendedoraSugeridaCodigo?: string | null;
  /**
   * A triagem terminou — quem leu a conversa inteira diz que ja ha o essencial.
   * Faz o lead subir para a gestao e dispara o aviso no WhatsApp do ADM.
   */
  prontoParaEncaminhar?: boolean;
}

export interface RegistrarLeadOutput {
  lead: Lead;
  reconhecimento: ReconhecimentoLead;
  /** Atalho para quem so quer saber se pode cumprimentar pelo nome. */
  conhecido: boolean;
}

/**
 * Porta de entrada da triagem. O `atwpp` chama isto ao receber mensagem de um
 * numero — ele nao tem banco, e este endpoint e a unica forma de a conversa
 * sobreviver ao restart.
 *
 * A CADEIA DE RECONHECIMENTO, nesta ordem:
 *
 *   1. lead ABERTO      -> continua nele. Quem escreveu ontem e voltou hoje
 *                          esta na MESMA conversa, nao numa nova
 *   2. lead ANTERIOR    -> abre lead novo reaproveitando nome, apelido e o
 *                          vinculo com o cliente. Ocasiao NAO se herda: a
 *                          pessoa voltou por outro motivo
 *   3. cliente do ERP   -> quem comprou na loja e escreve pela primeira vez
 *                          tambem e conhecido
 *   4. ninguem          -> lead em branco
 *
 * Todo lookup passa por `variantesTelefone`, porque numero brasileiro chega em
 * mais de uma forma (nono digito, DDI) e um falso negativo aqui nao da erro —
 * ele cria um lead duplicado em silencio e a cliente e perguntada de novo.
 */
@Injectable()
export class RegistrarLeadUseCase {
  private readonly logger = new Logger(RegistrarLeadUseCase.name);

  constructor(
    @Inject(LEAD_REPOSITORY)
    private readonly leads: ILeadRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
    private readonly buscarClientePorWhatsapp: BuscarClientePorWhatsappUseCase,
    private readonly avisarGestao: AvisarGestaoDeLeadUseCase,
  ) {}

  async execute(entrada: RegistrarLeadInput): Promise<RegistrarLeadOutput> {
    const variantes = variantesTelefone(entrada.whatsapp);
    const hashCanonico = hashField(normalizarTelefone(entrada.whatsapp));

    // 1. Conversa em andamento.
    const aberto = await this.primeiroPorVariante(variantes, (h) =>
      this.leads.buscarAbertoPorHash(h),
    );
    if (aberto) {
      const lead = await this.leads.atualizar(aberto.id, {
        nome: entrada.nome ?? undefined,
        apelido: entrada.apelido ?? undefined,
        origemContato: entrada.origemContato ?? undefined,
        ocasiao: entrada.ocasiao ?? undefined,
        produtosDesejados: entrada.produtosDesejados ?? undefined,
        resumoTriagem: entrada.resumoTriagem ?? undefined,
        vendedoraSugeridaCodigo: entrada.vendedoraSugeridaCodigo ?? undefined,
      });
      return {
        lead: await this.subirParaGestaoSePronto(lead, entrada),
        reconhecimento: 'CONVERSA_EM_ANDAMENTO',
        conhecido: true,
      };
    }

    // 2. Ja passou por aqui.
    const anterior = await this.primeiroPorVariante(variantes, (h) =>
      this.leads.buscarUltimoPorHash(h),
    );
    if (anterior) {
      // Nome e apelido se herdam; OCASIAO NAO. Quem procurou alianca em
      // novembro pode voltar em dezembro querendo outra coisa — herdar a
      // ocasiao antiga faria a Anastasia partir de uma premissa errada.
      const lead = await this.leads.criar({
        whatsapp: normalizarTelefone(entrada.whatsapp),
        whatsappHash: hashCanonico,
        nome: entrada.nome ?? anterior.nome,
        apelido: entrada.apelido ?? anterior.apelido,
        origemContato: entrada.origemContato ?? null,
        ocasiao: entrada.ocasiao ?? null,
        produtosDesejados: entrada.produtosDesejados ?? null,
        resumoTriagem: entrada.resumoTriagem ?? null,
        vendedoraSugeridaCodigo: entrada.vendedoraSugeridaCodigo ?? null,
        clienteId: anterior.clienteId,
      });
      return {
        lead: await this.subirParaGestaoSePronto(lead, entrada),
        reconhecimento: 'LEAD_ANTERIOR',
        conhecido: true,
      };
    }

    // 3. Cliente do ERP que nunca passou pela triagem.
    const cliente = await this.buscarCliente(variantes);
    const lead = await this.leads.criar({
      whatsapp: normalizarTelefone(entrada.whatsapp),
      whatsappHash: hashCanonico,
      nome: entrada.nome ?? cliente?.nome ?? null,
      apelido: entrada.apelido ?? null,
      origemContato: entrada.origemContato ?? null,
      ocasiao: entrada.ocasiao ?? null,
      produtosDesejados: entrada.produtosDesejados ?? null,
      resumoTriagem: entrada.resumoTriagem ?? null,
      vendedoraSugeridaCodigo: entrada.vendedoraSugeridaCodigo ?? null,
      clienteId: cliente?.id ?? null,
    });

    const final = await this.subirParaGestaoSePronto(lead, entrada);
    return cliente
      ? { lead: final, reconhecimento: 'CLIENTE_ERP', conhecido: true }
      : { lead: final, reconhecimento: 'NOVO', conhecido: false };
  }

  /**
   * A triagem acabou: sobe o lead para a gestao e avisa o ADM no WhatsApp.
   *
   * ACONTECE UMA VEZ SO, e a guarda e o proprio estado. A cada mensagem o
   * `atwpp` reavalia se ja ha o essencial, entao `prontoParaEncaminhar` chega
   * `true` de novo nos turnos seguintes — sem a checagem de
   * `TRIAGE_IN_PROGRESS`, o ADM receberia o mesmo aviso a cada frase.
   *
   * O aviso NAO participa da transacao: se o WhatsApp falhar, o lead fica em
   * READY_FOR_ROUTING do mesmo jeito, e o aviso pode ser reenviado depois.
   * Perder a notificacao e ruim; perder o lead seria pior.
   */
  private async subirParaGestaoSePronto(
    lead: Lead,
    entrada: RegistrarLeadInput,
  ): Promise<Lead> {
    if (!entrada.prontoParaEncaminhar) return lead;
    if (lead.estado !== 'TRIAGE_IN_PROGRESS') return lead;

    const promovido = await this.leads.atualizar(lead.id, {
      estado: 'READY_FOR_ROUTING',
      direcionadoGestaoEm: new Date(),
    });

    try {
      const enviados = await this.avisarGestao.execute(promovido);
      this.logger.log(
        `Lead ${promovido.id} pronto para encaminhar — ${enviados} aviso(s) enviado(s).`,
      );
    } catch (err) {
      this.logger.error(
        `Lead ${promovido.id} subiu para a gestao, mas o aviso falhou: ${String(err)}`,
      );
    }
    return promovido;
  }

  /**
   * Tenta o lookup em cada forma equivalente do numero, e para na primeira.
   *
   * As variantes vao por PARAMETRO, e nao por campo da classe: um use case do
   * Nest e singleton, e guardar estado de requisicao nele faz duas mensagens
   * simultaneas se misturarem.
   */
  private async primeiroPorVariante(
    variantes: string[],
    busca: (hash: string) => Promise<Lead | null>,
  ): Promise<Lead | null> {
    for (const variante of variantes) {
      const achado = await busca(hashField(variante));
      if (achado) return achado;
    }
    return null;
  }

  /**
   * O lookup do cliente tenta `whatsapp_hash` (via use case existente) e, se
   * nao achar, `telefone1_hash`.
   *
   * O segundo passo existe porque `clientes_perfil` — onde mora o
   * `whatsapp_hash` — SO NASCE se o cliente tiver WhatsApp no cadastro. Quem
   * veio do Safira com `telefone1` e sem WhatsApp nao seria encontrado nunca,
   * ainda que o numero fosse o mesmo.
   */
  private async buscarCliente(
    variantes: string[],
  ): Promise<{ id: string; nome: string } | null> {
    for (const variante of variantes) {
      const porWhatsapp = await this.buscarClientePorWhatsapp.execute(variante);
      // `id` e opcional na entidade de dominio (so existe depois de persistida).
      // Sem ele nao ha o que vincular — segue para a proxima variante.
      if (porWhatsapp?.id)
        return { id: porWhatsapp.id, nome: porWhatsapp.nome };

      const porTelefone = await this.clientes.buscarPorTelefone1Hash(
        hashField(variante),
      );
      if (porTelefone?.id)
        return { id: porTelefone.id, nome: porTelefone.nome };
    }
    return null;
  }
}
