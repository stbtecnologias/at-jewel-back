import { Inject, Injectable, Logger } from '@nestjs/common';
import { BuscarClientePorWhatsappUseCase } from '../../../clientes/application/use-cases/buscar-cliente-por-whatsapp.use-case';
import { LEAD_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  ILeadRepository,
  Lead,
  StatusLeadVendedora,
} from '../../domain/ports/repositories/lead-repository.port';

export interface AtualizarStatusLeadInput {
  leadId: string;
  /** O codigo DELA. Vem por closure de quem chama, nunca do modelo. */
  vendedoraCodigo: string;
  status: StatusLeadVendedora;
  /** Ausente nao apaga a que existe; a vendedora pode so trocar o status. */
  observacao?: string | null;
}

/**
 * O que aconteceu com a ponte para o cadastro de cliente.
 *
 * ==========================================================================
 * SAO TRES RESPOSTAS, E NAO DUAS — E A DIFERENCA E O PONTO.
 *
 * `NAO_SE_APLICA` e status que nao e VIROU_CLIENTE: nao se procurou nada.
 * `ENCONTRADO`    achou o cadastro pelo telefone e gravou o vinculo.
 * `NAO_ENCONTRADO` ela disse que comprou e o cadastro ainda nao existe.
 *
 * O terceiro caso e comum e NAO e erro: `clientes` e espelho do ERP, e a
 * sincronizacao demora. O que nao pode acontecer e a agente dizer "vinculei"
 * quando nao vinculou — e a licao do "ja anotei" do ATwpp, e por isso o
 * resultado carrega o fato em vez de esconde-lo num booleano otimista.
 * ==========================================================================
 */
export type VinculoDoLead = 'ENCONTRADO' | 'NAO_ENCONTRADO' | 'NAO_SE_APLICA';

export type AtualizarStatusLeadResultado =
  | { status: 'ATUALIZADO'; lead: Lead; vinculo: VinculoDoLead }
  /** Existe, mas nao foi encaminhado para ela. Ver o comentario do escopo. */
  | { status: 'NAO_E_DELA' }
  | { status: 'NAO_ENCONTRADO' };

/**
 * A VENDEDORA DA BAIXA NO LEAD — 22/09/2026, migracao 60.
 *
 * ==========================================================================
 * POR QUE ISTO EXISTE.
 *
 * Ate aqui o lead encaminhado nao tinha ciclo de vida nenhum: chegava a ela e
 * virava historico no mesmo instante (`encaminhar()` ja grava `fechado_em`).
 * A lista dela era tudo o que ja tinha recebido, para sempre, sem nada que
 * distinguisse o resolvido do esquecido.
 *
 * Quem viu foi o Lucas: "pq toda vez que ela quiser saber os leads dela
 * sempre vai vir uma lista enorme, pq nunca da baixa, e isso?".
 * ==========================================================================
 *
 * O ESCOPO E VERIFICADO AQUI, E NAO NO PROMPT. O `vendedoraCodigo` chega por
 * closure de quem chama — do telefone resolvido, no WhatsApp — e o lead so e
 * tocado se tiver sido encaminhado para ELA. Sem esta linha, bastaria o
 * modelo escolher outro id para uma vendedora escrever no lead de outra.
 */
@Injectable()
export class AtualizarStatusLeadUseCase {
  private readonly logger = new Logger(AtualizarStatusLeadUseCase.name);

  constructor(
    @Inject(LEAD_REPOSITORY)
    private readonly leads: ILeadRepository,
    private readonly buscarClientePorWhatsapp: BuscarClientePorWhatsappUseCase,
  ) {}

  async execute(
    entrada: AtualizarStatusLeadInput,
  ): Promise<AtualizarStatusLeadResultado> {
    const lead = await this.leads.buscarPorId(entrada.leadId);
    if (!lead) return { status: 'NAO_ENCONTRADO' };

    // A BARREIRA DO ESCOPO. Nao e "nao achei": o lead existe e e de outra
    // pessoa, e quem chama precisa saber a diferenca para nao responder
    // errado.
    if (lead.vendedoraAprovadaCodigo !== entrada.vendedoraCodigo) {
      return { status: 'NAO_E_DELA' };
    }

    const vinculo = await this.vincularSePreciso(lead, entrada.status);

    const atualizado = await this.leads.atualizarStatusVendedora(
      entrada.leadId,
      entrada.status,
      juntarObservacao(lead.observacaoVendedora, entrada.observacao),
    );

    return { status: 'ATUALIZADO', lead: atualizado, vinculo };
  }

  /**
   * A PONTE COM O CADASTRO, quando ela diz que o lead virou cliente.
   *
   * ========================================================================
   * ELA NAO DIGITA UUID NENHUM — o casamento e pelo TELEFONE.
   *
   * `clientes_perfil.whatsapp_hash` e UNIQUE e o lead carrega o mesmo numero.
   * O `BuscarClientePorWhatsappUseCase` ja tenta todas as formas equivalentes
   * (nono digito, DDI) e ja cai para `telefone_1` quando o cliente veio do
   * Safira sem WhatsApp no cadastro — reusar aquilo e melhor que escrever uma
   * segunda busca que divergiria da primeira.
   *
   * O CRM CONTINUA NAO ESCREVENDO EM `clientes`, que e espelho do ERP: aqui
   * so se APONTA para um cadastro que ja existe. Se nao existe, nao se cria.
   *
   * JA VINCULADO NAO REVINCULA: o `registrar-lead` amarra o cliente na
   * criacao quando reconhece o numero, e `vinculado_em` deve guardar a
   * primeira vez, que e o que permite auditar a ligacao.
   * ========================================================================
   */
  private async vincularSePreciso(
    lead: Lead,
    status: StatusLeadVendedora,
  ): Promise<VinculoDoLead> {
    if (status !== 'VIROU_CLIENTE') return 'NAO_SE_APLICA';
    if (lead.clienteId) return 'ENCONTRADO';

    const cliente = await this.buscarClientePorWhatsapp.execute(lead.whatsapp);
    // `id` e opcional na entidade de dominio — so existe depois de persistida.
    if (!cliente?.id) {
      this.logger.log(
        `Lead ${lead.id} marcado como VIROU_CLIENTE sem cadastro correspondente.`,
      );
      return 'NAO_ENCONTRADO';
    }

    await this.leads.vincularCliente(lead.id, cliente.id);
    return 'ENCONTRADO';
  }
}

/** Quanto de historico cabe antes de a coluna virar um diario. */
const TETO_OBSERVACAO = 2000;

/**
 * A OBSERVACAO NOVA SE SOMA A ANTIGA — 22/09/2026, e nao a substitui.
 *
 * ==========================================================================
 * SUBSTITUIR APAGARIA O CONTEXTO NA HORA EXATA EM QUE ELE IMPORTA.
 *
 * O fluxo real que mostrou isto, no primeiro teste da ferramenta:
 *
 *   "ja falei com o Aslan, pediu para voltar dia 10"  -> anota
 *   "pode dar baixa"  -> "algum motivo?"  -> "achou caro"
 *
 * Com substituicao, o motivo apagaria o "voltar dia 10" — que e justamente o
 * que explica por que nao vingou. Quem lesse depois veria a conclusao sem a
 * historia.
 *
 * COM DATA NA FRENTE, porque duas frases empilhadas sem data viram uma frase
 * so e ninguem sabe o que veio antes. Dia e mes bastam: e a vida de um lead,
 * nao um processo.
 *
 * O TETO CORTA O COMECO, e nao o fim: o que acabou de acontecer vale mais que
 * o primeiro contato. O corte deixa "[...]" para nao fingir que aquilo sempre
 * foi tudo.
 * ==========================================================================
 *
 * `undefined` significa "nao mexe" — ela pode trocar so o status. `null` e
 * string vazia apagam de proposito.
 */
export function juntarObservacao(
  anterior: string | null,
  nova: string | null | undefined,
  agora = new Date(),
): string | null | undefined {
  if (nova === undefined) return undefined;
  if (nova === null || !nova.trim()) return null;

  const dia = String(agora.getDate()).padStart(2, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const linha = `${dia}/${mes} · ${nova.trim()}`;

  const inteiro = anterior?.trim() ? `${anterior.trim()}\n${linha}` : linha;
  if (inteiro.length <= TETO_OBSERVACAO) return inteiro;
  return `[...]\n${inteiro.slice(inteiro.length - TETO_OBSERVACAO)}`;
}
