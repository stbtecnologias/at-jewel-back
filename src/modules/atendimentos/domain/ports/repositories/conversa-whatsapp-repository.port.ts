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

/**
 * Uma conversa VIVA no celular da vendedora — 29/09/2026.
 *
 * ==========================================================================
 * O PONTEIRO RESPONDE "ESTA CONVERSANDO?" UMA HORA ANTES DA LEITURA.
 *
 * A linha do tempo — que e o que todas as outras ferramentas da gestao leem —
 * so existe depois que o leitor roda, e o leitor espera uma hora DEPOIS DE A
 * CONVERSA PARAR. Entao "a Aline esta com algum cliente agora?" vinha sendo
 * respondido por um dado que e, por construcao, de uma hora atras. Em 29/09 o
 * Lucas trocou mensagem com a vendedora as 15:08 e as 15:17 a Anastasia disse
 * que nao havia registro nenhum — e nao havia mesmo, ate as 16:08.
 *
 * Esta leitura e outra coisa: e o PONTEIRO, que o webhook atualiza a cada
 * mensagem nos DOIS sentidos. Ela sabe QUE ha conversa e ha quanto tempo; nao
 * sabe, e nao pode fingir que sabe, sobre o que e.
 * ==========================================================================
 */
export interface ConversaEmAndamento {
  vendedoraId: string;
  /**
   * NULO NAO QUER DIZER "NAO E CLIENTE" — quer dizer "ainda nao se sabe".
   *
   * Enquanto o leitor nao passa, o numero desconhecido e indistinguivel entre
   * a cliente nova e o entregador. Quem mostrar isto tem de dizer "numero
   * ainda nao identificado", nunca "1 cliente".
   */
  clienteId: string | null;
  ultimaMensagemEm: Date;
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

  /**
   * As conversas com mensagem na janela `[de, ate)` — sem esperar o leitor.
   * Mais recente primeiro.
   *
   * ======================================================================
   * UMA JANELA, E NAO "DAQUI PARA TRAS", PORQUE SAO DUAS PERGUNTAS.
   *
   * "Ela esta conversando AGORA?" pede os ultimos 30 minutos. "Ela falou com
   * alguem HOJE?" pede da meia-noite ate a meia-noite seguinte — e no dia em
   * que perguntarem por ontem, a janela nao termina no agora. As duas leem o
   * mesmo ponteiro; o que muda e so o recorte.
   * ======================================================================
   *
   * ======================================================================
   * A CONVERSA `IGNORADA` FICA DE FORA, E ISSO E PRIVACIDADE, NAO FILTRO.
   *
   * O WAHA le a CONTA inteira: a irma, o grupo do predio, a operadora. A
   * `IGNORADA` e justamente a que o leitor ja julgou como "nao e assunto da
   * loja" — e devolve-la aqui faria a gestao ver, em tempo real, que a
   * vendedora esta no celular com a familia. Ninguem pediu isso, e o pedido
   * do Lucas em 29/09 era sobre CLIENTE.
   *
   * A `AGUARDANDO` entra porque ainda nao foi julgada, e e exatamente o caso
   * da cliente nova — que e quem interessa. O preco e que ela pode ser a
   * irma tambem, e por isso a ausencia de `clienteId` tem de aparecer como
   * "ainda nao identificado" ao inves de virar contagem de cliente.
   * ======================================================================
   */
  entre(
    de: Date,
    ate: Date,
    vendedoraId?: string | null,
  ): Promise<ConversaEmAndamento[]>;
}
