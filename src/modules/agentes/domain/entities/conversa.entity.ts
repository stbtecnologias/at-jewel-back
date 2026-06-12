import type { NomeAgente, PapelMensagem } from './enums';

export interface MensagemAgente {
  role: PapelMensagem;
  content: string;
}

export interface ConversaProps {
  id?: string;
  agente: NomeAgente;
  mensagens: MensagemAgente[];
  contexto?: Record<string, unknown> | null;
  clienteId?: string | null;
  vendedoraId?: string | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

// Registro persistido de uma conversa com um agente interno. As mensagens sao
// metadados operacionais do painel; nao guardamos PII de cliente aqui (so ids).
export class Conversa {
  readonly id: string | undefined;
  readonly agente: NomeAgente;
  readonly mensagens: MensagemAgente[];
  readonly contexto: Record<string, unknown> | null;
  readonly clienteId: string | null;
  readonly vendedoraId: string | null;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: ConversaProps) {
    this.id = props.id;
    this.agente = props.agente;
    this.mensagens = props.mensagens;
    this.contexto = props.contexto ?? null;
    this.clienteId = props.clienteId ?? null;
    this.vendedoraId = props.vendedoraId ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: ConversaProps): Conversa {
    if (!props.mensagens?.length) {
      throw new Error('Conversa exige ao menos uma mensagem');
    }
    return new Conversa(props);
  }
}
