// Porta que abstrai o gateway de WhatsApp (implementada via WAHA na infra).
// Mantem a aplicacao livre do provedor concreto — trocar WAHA por outro
// gateway no futuro nao toca no use case.
export interface IWhatsappGateway {
  /**
   * Envia uma mensagem de texto para um chat.
   * @param chatId identificador do chat no formato do WhatsApp (ex.: `5585...@c.us`).
   * @param texto  conteudo da mensagem.
   */
  enviarTexto(chatId: string, texto: string): Promise<void>;

  /**
   * Descobre o `chatId` real de um telefone, perguntando ao provedor.
   *
   * NAO MONTE O chatId CONCATENANDO. O identificador de uma conta de WhatsApp
   * nem sempre e o telefone: contas brasileiras criadas antes do nono digito
   * mantem o identificador ANTIGO. O celular 5585 9 8646 7241 e conhecido pelo
   * WhatsApp como 5585 8646 7241 — comprovado em 17/08/2026, quando mensagens
   * enviadas para a forma com o 9 foram aceitas com `ack: 1 (SERVER)` e nunca
   * chegaram. Sem erro nenhum: o envio "funciona" e a mensagem some.
   *
   * @returns o chatId (ex.: `558586467241@c.us`), ou `null` se o numero nao
   *          tem WhatsApp.
   */
  resolverChatId(telefone: string): Promise<string | null>;

  /**
   * Traduz o remetente que chega no webhook para um identificador que CONTEM
   * telefone.
   *
   * POR QUE EXISTE: o WhatsApp deixou de mandar o numero de quem escreve. O
   * campo `from` chega como LID — `Linked ID`, um identificador interno da
   * conta:
   *
   *     from: 2782...6435@lid        e nao     558586467241@c.us
   *
   * Descoberto em 20/08/2026, depurando por que a resposta da vendedora
   * chegava no back e ele nao a reconhecia: o codigo tirava os nao-digitos do
   * `from` e calculava o HMAC — do LID. Nenhum hash de telefone bateria nunca.
   * Na sessao de producao ja havia 48 LIDs mapeados, entao nao e excecao.
   *
   * E o mesmo erro de `resolverChatId`, na direcao contraria: supor que o
   * identificador do provedor e um telefone. A regra vale para os dois lados —
   * PERGUNTE AO PROVEDOR, nao deduza.
   *
   * Quem nao e LID volta como veio. Falha de consulta tambem devolve a entrada
   * original: o efeito e o remetente nao ser reconhecido, que e o lado seguro
   * de errar num canal com default-deny.
   */
  resolverRemetente(de: string): Promise<string>;
}
