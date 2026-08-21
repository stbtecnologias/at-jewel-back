import { Injectable, Logger } from '@nestjs/common';
import type { MensagemAgente } from '../../agentes/domain/entities/conversa.entity';

/**
 * Quantos turnos ficam na memoria. Doze = seis pares pergunta/resposta.
 *
 * E o que cobre um dialogo de trabalho inteiro sem inflar a conta: cada
 * mensagem manda TODO o historico ao modelo, entao o custo por resposta cresce
 * junto. Baixar para 8 economiza sem tirar quase nada; subir muito paga caro
 * por contexto que ninguem usa.
 */
const MAX_TURNOS = 12;

/**
 * Tempo sem falar que zera a conversa.
 *
 * DUAS HORAS, e curto de proposito. Este canal AGENDA e TRANSFERE CLIENTE.
 * Um "pode transferir" respondido no dia seguinte se referiria a outra coisa,
 * e o agente nao teria como saber. Memoria velha aqui e mais perigosa que
 * util — o canal do cliente, que so conversa, usa seis horas.
 */
const TTL_MS = 2 * 60 * 60_000;

/** Teto de conversas guardadas ao mesmo tempo. */
const MAX_CONVERSAS = 200;

interface Conversa {
  turnos: MensagemAgente[];
  atualizadoEm: number;
}

/**
 * A memoria de conversa do canal interno.
 *
 * ==========================================================================
 * VIVE NA RAM DO PROCESSO. Nao e arquivo, nao e tabela: e um Map dentro do
 * Node que esta rodando. Reiniciar o container apaga tudo, e nada disso
 * aparece no banco.
 *
 * Isso e uma ESCOLHA, nao um atalho: o que se guarda aqui e "o que estavamos
 * falando agora", que expira sozinho em duas horas de qualquer jeito. Persistir
 * exigiria migracao, escrita a cada mensagem e rotina de expurgo para guardar
 * algo descartavel por natureza.
 *
 * O QUE ISTO NAO E: registro. Nao serve para auditar depois o que a Marina
 * conversou semana passada — para isso existe `agentes_conversas`, gravada de
 * proposito e ainda nao ligada a este canal.
 * ==========================================================================
 *
 * A CHAVE E A IDENTIDADE RESOLVIDA, NUNCA O TELEFONE.
 *
 * O atwpp ja aprendeu essa: la a chave inclui a sessao porque o mesmo numero
 * podia falar com duas agentes e as conversas se misturavam. Aqui pesa mais —
 * misturar nao seria confusao, seria ESCOPO. Chaveando por telefone, um numero
 * que trocasse de dono herdaria a conversa de quem tinha antes, e o canal da
 * vendedora e o da gestao poderiam se cruzar.
 *
 * SO TEXTO, sem as chamadas de ferramenta. A API exige que todo `tool_use`
 * tenha o `tool_result` correspondente logo em seguida — guardar isso tornaria
 * o historico fragil de remontar. Guardando "voce perguntou X, eu respondi Y",
 * o dado que a ferramenta trouxe ja esta embutido no Y. O efeito e que ela
 * lembra o que DISSE, e reconsulta quando precisa do numero de novo — que e o
 * comportamento certo, porque o dado pode ter mudado.
 */
@Injectable()
export class MemoriaConversaService {
  private readonly logger = new Logger(MemoriaConversaService.name);
  private readonly conversas = new Map<string, Conversa>();

  /** Chave da vendedora. Id, e nao telefone — ver o cabecalho da classe. */
  static chaveVendedora(vendedoraId: string): string {
    return `vendedora:${vendedoraId}`;
  }

  /** Chave de quem e da gestao. */
  static chaveGestao(usuarioId: string): string {
    return `gestao:${usuarioId}`;
  }

  /** Os turnos anteriores, ou vazio se nao ha conversa viva. */
  carregar(chave: string): MensagemAgente[] {
    const c = this.conversas.get(chave);
    if (!c) return [];
    if (Date.now() - c.atualizadoEm > TTL_MS) {
      this.conversas.delete(chave);
      this.logger.debug('Conversa expirada por inatividade — memoria zerada.');
      return [];
    }
    return c.turnos;
  }

  /** Guarda o par pergunta/resposta e corta o excesso. */
  registrar(chave: string, pergunta: string, resposta: string): void {
    let c = this.conversas.get(chave);
    if (!c || Date.now() - c.atualizadoEm > TTL_MS) {
      this.descartarMaisAntigaSeCheio();
      c = { turnos: [], atualizadoEm: Date.now() };
      this.conversas.set(chave, c);
    }

    c.turnos.push({ role: 'user', content: pergunta });
    c.turnos.push({ role: 'assistant', content: resposta });

    // Corta em par para o historico nunca comecar com uma resposta solta: a
    // API recusa mensagens fora da alternancia user/assistant.
    if (c.turnos.length > MAX_TURNOS) {
      const excedente = c.turnos.length - MAX_TURNOS;
      c.turnos.splice(0, excedente % 2 === 0 ? excedente : excedente + 1);
    }
    c.atualizadoEm = Date.now();
  }

  /** Zera a conversa de alguem. */
  esquecer(chave: string): void {
    this.conversas.delete(chave);
  }

  /** Teto de conversas: descarta a menos recente (varredura simples). */
  private descartarMaisAntigaSeCheio(): void {
    if (this.conversas.size < MAX_CONVERSAS) return;
    let maisAntiga: string | null = null;
    let menorTs = Infinity;
    for (const [chave, c] of this.conversas) {
      if (c.atualizadoEm < menorTs) {
        menorTs = c.atualizadoEm;
        maisAntiga = chave;
      }
    }
    if (maisAntiga) this.conversas.delete(maisAntiga);
  }
}
