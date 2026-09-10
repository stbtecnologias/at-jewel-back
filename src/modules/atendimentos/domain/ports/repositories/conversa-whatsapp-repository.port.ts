/**
 * A fila de conversas do numero corporativo a serem lidas (MEL-15).
 *
 * ==========================================================================
 * O QUE ESTA PORTA DELIBERADAMENTE NAO OFERECE: gravar mensagem.
 *
 * Nao existe `salvarMensagem` aqui, e nao e esquecimento. O conteudo mora no
 * WAHA e a tela le ao vivo; o que este repositorio guarda e o PONTEIRO para a
 * conversa e a MARCA D'AGUA de ate onde ja se leu. Ver a migracao 56.
 * ==========================================================================
 */

export type EstadoConversa = 'AGUARDANDO' | 'LIDA' | 'IGNORADA';

export interface ConversaWhatsapp {
  id: string;
  vendedoraId: string;
  /** "5585...@c.us" — decifrado pelo ORM. */
  chatId: string;
  /** Nulo enquanto o numero for desconhecido. */
  clienteId: string | null;
  atendimentoId: string | null;
  leadId: string | null;
  ultimaMensagemEm: Date;
  /** Nulo = nunca lida; a leitura pega a conversa inteira. */
  lidaAte: Date | null;
  lerEm: Date | null;
  estado: EstadoConversa;
  tentativas: number;
}

export interface DadosDaMensagem {
  vendedoraId: string;
  chatId: string;
  /** Quando a mensagem passou. */
  em: Date;
  /** Quando reler, se nada mais chegar ate la. */
  lerEm: Date;
  /** Quando ja se sabe de quem e — evita a leitura ter que descobrir. */
  clienteId?: string | null;
}

export interface FechamentoDaLeitura {
  /** A marca d'agua nova. So chega aqui quando a leitura deu certo. */
  lidaAte: Date;
  estado: EstadoConversa;
  /** Nulo = nada pendente; sai da fila ate chegar mensagem nova. */
  lerEm: Date | null;
  clienteId?: string | null;
  atendimentoId?: string | null;
  leadId?: string | null;
}

export interface IConversaWhatsappRepository {
  /**
   * A mensagem passou: cria a linha ou empurra o relogio da existente.
   *
   * UPSERT por (vendedora, chat). Chamado a CADA mensagem, entao mensagem nova
   * enquanto a conversa corre so adia a leitura — que e a regra de 08/09/2026:
   * le-se uma hora depois de a conversa PARAR, nao uma hora depois de comecar.
   *
   * `clienteId` nunca e apagado por esta chamada: uma vez que se sabe de quem
   * e a conversa, mensagem seguinte nao desfaz o vinculo.
   */
  registrarMensagem(dados: DadosDaMensagem): Promise<void>;

  /** As conversas cuja hora de ler ja passou, mais antigas primeiro. */
  listarParaLeitura(agora: Date, limite: number): Promise<ConversaWhatsapp[]>;

  /** Leitura bem-sucedida: a marca d'agua anda e as tentativas zeram. */
  concluirLeitura(id: string, dados: FechamentoDaLeitura): Promise<void>;

  /**
   * Leitura falhou. A MARCA D'AGUA NAO ANDA — o trecho volta inteiro na
   * proxima rodada. `proximaTentativa` nulo desiste da conversa ate chegar
   * mensagem nova.
   */
  registrarFalha(id: string, proximaTentativa: Date | null): Promise<void>;
}
